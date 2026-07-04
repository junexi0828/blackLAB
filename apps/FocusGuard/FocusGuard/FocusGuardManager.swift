import Foundation
import AVFoundation
import Combine

enum FocusGuardState: String, Codable {
    case normal = "정상"
    case warning = "경고"
    case failed = "실패"
}

@MainActor
final class FocusGuardManager: ObservableObject {
    static let shared = FocusGuardManager()

    // Dynamic Configurations
    @Published var isFocusGuardActive: Bool = true
    @Published var isMockCameraEnabled: Bool = false
    @Published var isSpeechDisabled: Bool = false
    @Published var startupGraceSeconds: TimeInterval = 5.0
    @Published var warningThresholdSeconds: TimeInterval = 3.0
    @Published var failThresholdSeconds: TimeInterval = 8.0

    @Published var isFacePresent: Bool = true {
        didSet {
            if isFacePresent {
                lastFaceDetectedTime = Date()
                absentDuration = 0
            }
        }
    }
    @Published var state: FocusGuardState = .normal
    @Published var isDebugPanelOpen: Bool = false
    @Published var absentDuration: TimeInterval = 0

    private var lastFaceDetectedTime: Date = Date()
    private var sessionStartTime: Date?
    private var timer: Timer?
    private let speechSynthesizer = AVSpeechSynthesizer()

    init() {
        loadConfig()
    }

    func loadConfig() {
        let env = ProcessInfo.processInfo.environment
        let defaults = UserDefaults(suiteName: "group.com.juns.beyondcave")
        
        // 1. Mock camera: env var takes precedence, otherwise fallback to settings
        self.isMockCameraEnabled = env["FOCUSGUARD_MOCK_CAMERA"] == "1" || (defaults?.bool(forKey: "settings.isMockCameraEnabled") ?? false)
        
        // 2. Focus Guard activation status
        self.isFocusGuardActive = defaults?.object(forKey: "settings.isFocusGuardActive") as? Bool ?? true
        
        // 3. Speech warnings disabled: env var takes precedence, otherwise fallback to settings
        let speechDisabledSetting = !(defaults?.object(forKey: "settings.isSpeechEnabled") as? Bool ?? true)
        self.isSpeechDisabled = env["FOCUSGUARD_DISABLE_SPEECH"] == "1" || speechDisabledSetting
        
        // 4. Thresholds (Priority: Env -> UserDefaults -> Default values)
        if let envGrace = env["FOCUSGUARD_STARTUP_GRACE_SECONDS"], let val = TimeInterval(envGrace) {
            self.startupGraceSeconds = val
        } else {
            let saved = defaults?.double(forKey: "settings.startupGrace") ?? 0
            self.startupGraceSeconds = saved > 0 ? saved : 5.0
        }
        
        if let envWarning = env["FOCUSGUARD_WARNING_THRESHOLD_SECONDS"], let val = TimeInterval(envWarning) {
            self.warningThresholdSeconds = val
        } else {
            let saved = defaults?.double(forKey: "settings.warningThreshold") ?? 0
            self.warningThresholdSeconds = saved > 0 ? saved : 3.0
        }
        
        if let envFail = env["FOCUSGUARD_FAIL_THRESHOLD_SECONDS"], let val = TimeInterval(envFail) {
            self.failThresholdSeconds = val
        } else {
            let saved = defaults?.double(forKey: "settings.failThreshold") ?? 0
            self.failThresholdSeconds = saved > 0 ? saved : 8.0
        }
        
        if isMockCameraEnabled {
            print("[FocusGuardManager] Loaded Config - Mock Camera: Enabled, Grace: \(startupGraceSeconds)s, Warning: \(warningThresholdSeconds)s, Fail: \(failThresholdSeconds)s, SpeechDisabled: \(isSpeechDisabled)")
        }
    }

    func startTracking() {
        // Only run tracking if focus guard is active AND mock camera is enabled
        guard isFocusGuardActive && isMockCameraEnabled else { return }
        
        sessionStartTime = Date()
        isFacePresent = true
        state = .normal
        absentDuration = 0
        lastFaceDetectedTime = Date()
        
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateTracking()
            }
        }
    }

    func stopTracking() {
        timer?.invalidate()
        timer = nil
        sessionStartTime = nil
    }

    private func updateTracking() {
        guard let sessionStartTime = sessionStartTime else { return }
        
        let elapsedSinceStart = Date().timeIntervalSince(sessionStartTime)
        
        // During the startup grace period, we ignore face absence
        if elapsedSinceStart < startupGraceSeconds {
            state = .normal
            return
        }
        
        if isFacePresent {
            if state != .normal {
                state = .normal
                speak("집중 상태가 정상입니다.")
            }
        } else {
            let absentTime = Date().timeIntervalSince(lastFaceDetectedTime)
            absentDuration = absentTime
            
            if absentTime >= failThresholdSeconds {
                if state != .failed {
                    state = .failed
                    speak("수련 실패")
                }
            } else if absentTime >= warningThresholdSeconds {
                if state != .warning {
                    state = .warning
                    speak("수련에 집중하십시오.")
                }
            }
        }
    }

    private func speak(_ text: String) {
        guard !isSpeechDisabled else { return }
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "ko-KR")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        
        if speechSynthesizer.isSpeaking {
            speechSynthesizer.stopSpeaking(at: .immediate)
        }
        speechSynthesizer.speak(utterance)
    }
}
