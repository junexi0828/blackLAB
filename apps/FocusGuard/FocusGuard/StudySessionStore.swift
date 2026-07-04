import Foundation
@preconcurrency import ActivityKit
import SwiftUI
import WidgetKit

@MainActor
final class StudySessionStore: ObservableObject {
    struct SessionEntry: Identifiable, Hashable {
        let id: UUID
        let date: Date
        let duration: TimeInterval

        init(id: UUID = UUID(), date: Date, duration: TimeInterval) {
            self.id = id
            self.date = date
            self.duration = duration
        }
    }

    @Published var isRunning = false
    @Published var isPaused = false
    @Published var accumulatedTime: TimeInterval = 0
    @Published var sessionStartedAt: Date?
    @Published var totalStudySeconds: TimeInterval
    @Published var todayStudySeconds: TimeInterval
    @Published var currentSessionSeconds: TimeInterval = 0
    @Published var justAchievedCycle = false
    @Published var sessionLog: [SessionEntry]

    // User Settings persisted in UserDefaults
    private let userDefaults = UserDefaults(suiteName: "group.com.juns.beyondcave")

    @Published var isFocusGuardActive: Bool {
        didSet {
            userDefaults?.set(isFocusGuardActive, forKey: "settings.isFocusGuardActive")
            FocusGuardManager.shared.loadConfig()
        }
    }
    @Published var isMockCameraEnabledSetting: Bool {
        didSet {
            userDefaults?.set(isMockCameraEnabledSetting, forKey: "settings.isMockCameraEnabled")
            FocusGuardManager.shared.loadConfig()
        }
    }
    @Published var isSpeechEnabled: Bool {
        didSet {
            userDefaults?.set(isSpeechEnabled, forKey: "settings.isSpeechEnabled")
            FocusGuardManager.shared.loadConfig()
        }
    }
    @Published var startupGraceSetting: Double {
        didSet {
            userDefaults?.set(startupGraceSetting, forKey: "settings.startupGrace")
            FocusGuardManager.shared.loadConfig()
        }
    }
    @Published var warningThresholdSetting: Double {
        didSet {
            userDefaults?.set(warningThresholdSetting, forKey: "settings.warningThreshold")
            FocusGuardManager.shared.loadConfig()
        }
    }
    @Published var failThresholdSetting: Double {
        didSet {
            userDefaults?.set(failThresholdSetting, forKey: "settings.failThreshold")
            FocusGuardManager.shared.loadConfig()
        }
    }
    @Published var selectedSoundscape: String {
        didSet {
            userDefaults?.set(selectedSoundscape, forKey: "settings.selectedSoundscape")
            if isRunning {
                CaveSoundManager.shared.start(soundscape: selectedSoundscape)
            }
        }
    }
    @Published var progressCycleType: String {
        didSet {
            userDefaults?.set(progressCycleType, forKey: "settings.progressCycleType")
            persist(reloadWidget: true)
            if #available(iOS 16.1, *) {
                Task { @MainActor in
                    await self.updateLiveActivity()
                }
            }
        }
    }

    private var ticker: Timer?
    private var lastWidgetReloadSecond: Int = -1
    @available(iOS 16.1, *)
    private var liveActivity: Activity<FocusStudyAttributes>?

    init() {
        var snapshot = SharedCaveStore.load()
        
        let defaults = UserDefaults(suiteName: "group.com.juns.beyondcave")
        let isMock = ProcessInfo.processInfo.environment["FOCUSGUARD_MOCK_CAMERA"] == "1" || (defaults?.bool(forKey: "settings.isMockCameraEnabled") ?? false)
        
        if isMock {
            // Clean start for test environments
            snapshot.isRunning = false
            snapshot.isPaused = false
            snapshot.accumulatedTime = 0
            snapshot.sessionStartedAt = nil
            snapshot.currentSessionSeconds = 0
            SharedCaveStore.save(snapshot)
        }
        
        totalStudySeconds = snapshot.totalStudySeconds
        todayStudySeconds = snapshot.todayStudySeconds
        currentSessionSeconds = snapshot.currentSessionSeconds
        sessionLog = snapshot.sessionLog.map { SessionEntry(id: $0.id, date: $0.date, duration: $0.duration) }
        
        // Restore active session state for single source of truth and crash resilience
        isRunning = snapshot.isRunning
        isPaused = snapshot.isPaused
        accumulatedTime = snapshot.accumulatedTime
        sessionStartedAt = snapshot.sessionStartedAt

        // Initialize settings
        self.isFocusGuardActive = defaults?.object(forKey: "settings.isFocusGuardActive") as? Bool ?? true
        self.isMockCameraEnabledSetting = defaults?.object(forKey: "settings.isMockCameraEnabled") as? Bool ?? false
        self.isSpeechEnabled = defaults?.object(forKey: "settings.isSpeechEnabled") as? Bool ?? true
        
        let savedGrace = defaults?.double(forKey: "settings.startupGrace") ?? 5.0
        self.startupGraceSetting = savedGrace > 0 ? savedGrace : 5.0
        
        let savedWarning = defaults?.double(forKey: "settings.warningThreshold") ?? 3.0
        self.warningThresholdSetting = savedWarning > 0 ? savedWarning : 3.0
        
        let savedFail = defaults?.double(forKey: "settings.failThreshold") ?? 8.0
        self.failThresholdSetting = savedFail > 0 ? savedFail : 8.0
        
        self.selectedSoundscape = defaults?.string(forKey: "settings.selectedSoundscape") ?? "없음"
        self.progressCycleType = defaults?.string(forKey: "settings.progressCycleType") ?? "1각 (15분)"

        // Resume ticker if session is active
        if isRunning {
            scheduleTicker()
        }
        
        // 백그라운드/포그라운드 앱 수명주기 갱신 동기화 패치
        NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.stopTicker()
            }
        }
        
        NotificationCenter.default.addObserver(
            forName: UIApplication.willEnterForegroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self = self else { return }
                if self.isRunning {
                    if let startedAt = self.sessionStartedAt {
                        self.currentSessionSeconds = self.accumulatedTime + Date().timeIntervalSince(startedAt)
                    }
                    self.scheduleTicker()
                }
            }
        }
    }

    // Dynamic ticking totals to maintain absolute data integrity
    var tickingTotalSeconds: TimeInterval {
        let currentSecs = isRunning && sessionStartedAt != nil ? accumulatedTime + Date().timeIntervalSince(sessionStartedAt!) : accumulatedTime
        return totalStudySeconds + currentSecs
    }

    var tickingTodaySeconds: TimeInterval {
        let currentSecs = isRunning && sessionStartedAt != nil ? accumulatedTime + Date().timeIntervalSince(sessionStartedAt!) : accumulatedTime
        return todayStudySeconds + currentSecs
    }

    var totalStudyText: String {
        CaveTimeFormatter.format(seconds: tickingTotalSeconds)
    }

    var todayStudyText: String {
        CaveTimeFormatter.format(seconds: tickingTodaySeconds)
    }

    var currentSessionText: String {
        let currentSecs = isRunning && sessionStartedAt != nil ? accumulatedTime + Date().timeIntervalSince(sessionStartedAt!) : accumulatedTime
        return CaveTimeFormatter.format(seconds: currentSecs)
    }

    var recentEntries: [SessionEntry] {
        Array(sessionLog.prefix(5))
    }

    // Tier calculation based on total study hours
    var userTier: String {
        let hours = tickingTotalSeconds / 3600.0
        if hours >= 1000 {
            return "생사경 (生死境)"
        } else if hours >= 500 {
            return "현경 (玄境)"
        } else if hours >= 250 {
            return "화경 (化境)"
        } else if hours >= 120 {
            return "초절정 고수 (超絶頂高手)"
        } else if hours >= 50 {
            return "절정 고수 (絶頂高手)"
        } else if hours >= 15 {
            return "일류 고수 (一流高手)"
        } else if hours >= 5 {
            return "이류 고수 (二流高手)"
        } else if hours >= 1 {
            return "삼류 무사 (三流武士)"
        } else {
            return "입문자 (入門者)"
        }
    }
    
    var userTierKoreanOnly: String {
        let hours = tickingTotalSeconds / 3600.0
        if hours >= 1000 {
            return "생사경(生死境)"
        } else if hours >= 500 {
            return "현경(玄境)"
        } else if hours >= 250 {
            return "화경(化境)"
        } else if hours >= 120 {
            return "초절정 고수(超絶頂高手)"
        } else if hours >= 50 {
            return "절정 고수(絶頂高手)"
        } else if hours >= 15 {
            return "일류 고수(一流高手)"
        } else if hours >= 5 {
            return "이류 고수(二流高手)"
        } else if hours >= 1 {
            return "삼류 무사(三流武士)"
        } else {
            return "입문자(入門者)"
        }
    }

    var currentSessionOrientalText: String {
        let currentSecs = isRunning && sessionStartedAt != nil ? accumulatedTime + Date().timeIntervalSince(sessionStartedAt!) : accumulatedTime
        return OrientalTimeFormatter.formatToOrientalDuration(seconds: currentSecs)
    }

    // Statistics
    var totalSessionsCount: Int {
        sessionLog.count
    }

    var averageSessionDurationText: String {
        guard !sessionLog.isEmpty else { return "0초" }
        let total = sessionLog.map { $0.duration }.reduce(0, +)
        let avg = total / Double(sessionLog.count)
        return CaveTimeFormatter.format(seconds: avg)
    }

    var streakDays: Int {
        guard !sessionLog.isEmpty else { return 0 }
        let calendar = Calendar.current
        
        let sortedLogs = sessionLog.sorted { $0.date > $1.date }
        
        var uniqueDays: [Date] = []
        for entry in sortedLogs {
            let startOfDay = calendar.startOfDay(for: entry.date)
            if !uniqueDays.contains(startOfDay) {
                uniqueDays.append(startOfDay)
            }
        }
        
        guard let firstDay = uniqueDays.first else { return 0 }
        
        let today = calendar.startOfDay(for: Date())
        let components = calendar.dateComponents([.day], from: firstDay, to: today)
        
        guard let daysDiff = components.day, daysDiff <= 1 else {
            return 0
        }
        
        var streak = 1
        for i in 0..<(uniqueDays.count - 1) {
            let current = uniqueDays[i]
            let next = uniqueDays[i + 1]
            let diff = calendar.dateComponents([.day], from: next, to: current).day ?? 0
            if diff == 1 {
                streak += 1
            } else if diff > 1 {
                break
            }
        }
        return streak
    }

    func resetAllData() {
        totalStudySeconds = 0
        todayStudySeconds = 0
        currentSessionSeconds = 0
        sessionLog = []
        
        userDefaults?.set(0.0, forKey: "settings.startupGrace")
        userDefaults?.set(0.0, forKey: "settings.warningThreshold")
        userDefaults?.set(0.0, forKey: "settings.failThreshold")
        userDefaults?.set(true, forKey: "settings.isFocusGuardActive")
        userDefaults?.set(false, forKey: "settings.isMockCameraEnabled")
        userDefaults?.set(true, forKey: "settings.isSpeechEnabled")
        userDefaults?.set("없음", forKey: "settings.selectedSoundscape")
        userDefaults?.set("1각 (15분)", forKey: "settings.progressCycleType")
        
        isFocusGuardActive = true
        isMockCameraEnabledSetting = false
        isSpeechEnabled = true
        startupGraceSetting = 5.0
        warningThresholdSetting = 3.0
        failThresholdSetting = 8.0
        selectedSoundscape = "없음"
        progressCycleType = "1각 (15분)"
        
        persist()
    }

    func deleteEntry(id: UUID) {
        guard let index = sessionLog.firstIndex(where: { $0.id == id }) else { return }
        let entry = sessionLog[index]
        
        // Subtract duration from cumulative totals to maintain database consistency
        totalStudySeconds = max(totalStudySeconds - entry.duration, 0)
        
        let calendar = Calendar.current
        if calendar.isDateInToday(entry.date) {
            todayStudySeconds = max(todayStudySeconds - entry.duration, 0)
        }
        
        sessionLog.remove(at: index)
        persist()
    }

    func startSession() {
        guard !isRunning else { return }
        isRunning = true
        isPaused = false
        accumulatedTime = 0
        sessionStartedAt = Date()
        currentSessionSeconds = 0
        if #available(iOS 16.1, *) {
            startLiveActivity()
        }
        
        // Start FocusGuard tracking if enabled
        if FocusGuardManager.shared.isMockCameraEnabled {
            FocusGuardManager.shared.startTracking()
        }
        
        persist(reloadWidget: true)
        scheduleTicker()
        
        // 가벼운 환경음 재생 시작
        CaveSoundManager.shared.start(soundscape: selectedSoundscape)
    }

    func pauseSession() {
        guard isRunning else { return }
        if let startedAt = sessionStartedAt {
            accumulatedTime += Date().timeIntervalSince(startedAt)
        }
        isRunning = false
        isPaused = true
        sessionStartedAt = nil
        stopTicker()
        
        // 가벼운 환경음 재생 중지
        CaveSoundManager.shared.stop()
        
        if FocusGuardManager.shared.isMockCameraEnabled {
            FocusGuardManager.shared.stopTracking()
        }
        
        currentSessionSeconds = accumulatedTime
        persist(reloadWidget: true)
        
        if #available(iOS 16.1, *) {
            Task { @MainActor in
                await self.updateLiveActivity()
            }
        }
    }

    func resumeSession() {
        guard isPaused else { return }
        isRunning = true
        isPaused = false
        sessionStartedAt = Date()
        
        if FocusGuardManager.shared.isMockCameraEnabled {
            FocusGuardManager.shared.startTracking()
        }
        
        persist(reloadWidget: true)
        scheduleTicker()
        
        // 가벼운 환경음 재생 재개
        CaveSoundManager.shared.start(soundscape: selectedSoundscape)
    }

    func stopSession() {
        guard isRunning || isPaused else { return }
        
        let finalSessionSeconds: TimeInterval
        if isRunning, let startedAt = sessionStartedAt {
            finalSessionSeconds = accumulatedTime + Date().timeIntervalSince(startedAt)
        } else {
            finalSessionSeconds = accumulatedTime
        }
        
        // Stop FocusGuard tracking if enabled
        if FocusGuardManager.shared.isMockCameraEnabled {
            FocusGuardManager.shared.stopTracking()
        }
        
        isRunning = false
        isPaused = false
        sessionStartedAt = nil
        accumulatedTime = 0
        stopTicker()

        // 가벼운 환경음 재생 중지
        CaveSoundManager.shared.stop()
        
        totalStudySeconds += finalSessionSeconds
        todayStudySeconds += finalSessionSeconds
        sessionLog.insert(SessionEntry(date: Date(), duration: finalSessionSeconds), at: 0)
        
        if #available(iOS 16.1, *) {
            Task { @MainActor in
                await self.endLiveActivity(finalSessionSeconds: finalSessionSeconds)
            }
        }
        currentSessionSeconds = 0
        persist(reloadWidget: true)
    }

    private func scheduleTicker() {
        stopTicker()
        ticker = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.tick()
            }
        }
    }

    private func stopTicker() {
        ticker?.invalidate()
        ticker = nil
    }

    private func tick() {
        // If paused, ticker shouldn't be running, but guard isRunning
        guard isRunning, let startedAt = sessionStartedAt else { return }
        
        // If FocusGuard has failed, freeze the time update.
        if FocusGuardManager.shared.isMockCameraEnabled && FocusGuardManager.shared.state == .failed {
            persist(reloadWidget: true)
            return
        }
        
        let previousSeconds = currentSessionSeconds
        currentSessionSeconds = accumulatedTime + Date().timeIntervalSince(startedAt)
        
        // 내공 돌파 (1각/1식경) 정수 초 도달 순간 감지
        let currentSecondInt = Int(currentSessionSeconds)
        let previousSecondInt = Int(previousSeconds)
        if currentSecondInt > 0 && currentSecondInt != previousSecondInt {
            let cycleSecs: Int = progressCycleType == "1식경 (30분)" ? 1800 : 900
            if currentSecondInt % cycleSecs == 0 {
                // 내공 돌파! 경쇠 종소리 연주 및 햅틱
                CaveSoundManager.shared.playTempleBell()
                justAchievedCycle = true
                
                // 0.8초 후 시각 효과 펄스 리셋
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                    self.justAchievedCycle = false
                }
            }
        }
        
        // Request view updates
        objectWillChange.send()
        
        // 15초 주기로 홈화면 위젯 리로드 및 물리 디스크 저장 (과도한 파일 I/O 방지)
        let shouldReload = (currentSecondInt % 15 == 0) && (currentSecondInt != lastWidgetReloadSecond)
        if shouldReload {
            lastWidgetReloadSecond = currentSecondInt
            persist(reloadWidget: true)
        }
    }

    private func persist(reloadWidget: Bool = false) {
        let effectiveCurrentSeconds: TimeInterval
        if isRunning, let startedAt = sessionStartedAt {
            effectiveCurrentSeconds = accumulatedTime + Date().timeIntervalSince(startedAt)
        } else {
            effectiveCurrentSeconds = currentSessionSeconds
        }
        SharedCaveStore.save(
            SharedCaveSnapshot(
                totalStudySeconds: totalStudySeconds,
                todayStudySeconds: todayStudySeconds,
                currentSessionSeconds: effectiveCurrentSeconds,
                isRunning: isRunning,
                isPaused: isPaused,
                accumulatedTime: accumulatedTime,
                progressCycleType: progressCycleType,
                lastUpdatedAt: Date(),
                sessionStartedAt: sessionStartedAt,
                sessionLog: sessionLog.map { SessionLogEntry(id: $0.id, date: $0.date, duration: $0.duration) }
            )
        )
        // 불필요한 빈번한 위젯 리로드를 피하고 요청한 타이밍에만 수행
        if reloadWidget {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    @available(iOS 16.1, *)
    private func startLiveActivity() {
        let enabled = ActivityAuthorizationInfo().areActivitiesEnabled
        print("[LiveActivity] areActivitiesEnabled: \(enabled)")
        guard enabled else {
            print("[LiveActivity] Authorization guard failed. Live Activities are disabled for this app in iOS Settings.")
            return
        }
        
        let startedAt = sessionStartedAt ?? Date()
        let attributes = FocusStudyAttributes(title: FocusStudyLiveActivity.activityTitle)
        let state = FocusStudyAttributes.ContentState(
            sessionStartedAt: startedAt,
            totalStudySeconds: tickingTotalSeconds,
            todayStudySeconds: tickingTodaySeconds,
            currentSessionSeconds: currentSessionTextSeconds,
            isRunning: isRunning,
            isPaused: isPaused,
            progressCycleType: progressCycleType,
            updatedAt: Date(),
            currentBeastImageName: "TigerSpirit"
        )

        do {
            liveActivity = try Activity.request(
                attributes: attributes,
                content: .init(state: state, staleDate: nil),
                pushType: nil
            )
            print("[LiveActivity] Request succeeded! Activity ID: \(liveActivity?.id ?? "nil")")
        } catch {
            print("[LiveActivity] Request failed with error: \(error.localizedDescription)")
        }
    }

    @available(iOS 16.1, *)
    private func updateLiveActivity() async {
        guard let liveActivity else { return }
        let beastImages = ["TigerSpirit", "DragonFocus", "PhoenixFocus", "BambooSpirit", "CaveHermit", "LotusZen"]
        let index = (Int(currentSessionSeconds) / 8) % beastImages.count
        let beastName = beastImages[index]
        
        let state = FocusStudyAttributes.ContentState(
            sessionStartedAt: sessionStartedAt ?? Date(),
            totalStudySeconds: tickingTotalSeconds,
            todayStudySeconds: tickingTodaySeconds,
            currentSessionSeconds: currentSessionSeconds,
            isRunning: isRunning,
            isPaused: isPaused,
            progressCycleType: progressCycleType,
            updatedAt: Date(),
            currentBeastImageName: beastName
        )
        await liveActivity.update(.init(state: state, staleDate: nil))
    }

    @available(iOS 16.1, *)
    private func endLiveActivity(finalSessionSeconds: TimeInterval) async {
        guard let liveActivity else { return }
        let state = FocusStudyAttributes.ContentState(
            sessionStartedAt: sessionStartedAt ?? Date(),
            totalStudySeconds: totalStudySeconds,
            todayStudySeconds: todayStudySeconds,
            currentSessionSeconds: finalSessionSeconds,
            isRunning: false,
            isPaused: false,
            progressCycleType: progressCycleType,
            updatedAt: Date(),
            currentBeastImageName: "TigerSpirit"
        )
        await liveActivity.end(.init(state: state, staleDate: nil), dismissalPolicy: .immediate)
        self.liveActivity = nil
    }

    var currentSessionTextSeconds: TimeInterval {
        if isRunning, let startedAt = sessionStartedAt {
            return accumulatedTime + Date().timeIntervalSince(startedAt)
        }
        return currentSessionSeconds
    }
}
