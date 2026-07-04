import Foundation

struct SharedCaveSnapshot: Codable, Hashable {
    var totalStudySeconds: TimeInterval
    var todayStudySeconds: TimeInterval
    var currentSessionSeconds: TimeInterval
    var isRunning: Bool
    var isPaused: Bool
    var accumulatedTime: TimeInterval
    var progressCycleType: String
    var lastUpdatedAt: Date
    var sessionStartedAt: Date?
    var sessionLog: [SessionLogEntry]

    static let empty = SharedCaveSnapshot(
        totalStudySeconds: 0,
        todayStudySeconds: 0,
        currentSessionSeconds: 0,
        isRunning: false,
        isPaused: false,
        accumulatedTime: 0,
        progressCycleType: "1각 (15분)",
        lastUpdatedAt: Date(),
        sessionStartedAt: nil,
        sessionLog: []
    )
}

struct SessionLogEntry: Codable, Hashable, Identifiable {
    let id: UUID
    let date: Date
    let duration: TimeInterval
}

enum CaveTimeFormatter {
    static func format(seconds: TimeInterval) -> String {
        let total = max(Int(seconds.rounded()), 0)
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        } else {
            return String(format: "%02d:%02d", minutes, secs)
        }
    }
}

enum SharedCaveStore {
    static let suiteName = "group.com.juns.beyondcave"
    private static let snapshotKey = "cave.snapshot"

    static func load() -> SharedCaveSnapshot {
        guard let defaults = UserDefaults(suiteName: suiteName),
              let data = defaults.data(forKey: snapshotKey),
              let snapshot = try? JSONDecoder().decode(SharedCaveSnapshot.self, from: data) else {
            return .empty
        }
        return snapshot
    }

    static func save(_ snapshot: SharedCaveSnapshot) {
        guard let defaults = UserDefaults(suiteName: suiteName),
              let data = try? JSONEncoder().encode(snapshot) else {
            return
        }
        defaults.set(data, forKey: snapshotKey)
    }
}

// MARK: - 무협 세계관 전통 시간 포맷터 (시진/식경/각)
public enum OrientalTimeFormatter {
    public static func formatToOrientalDuration(seconds: TimeInterval) -> String {
        let total = Int(seconds)
        if total == 0 { return "정진 직전" }
        
        let shijin = total / 7200
        let remainderAfterShijin = total % 7200
        
        let shikgyeong = remainderAfterShijin / 1800
        let remainderAfterShik = remainderAfterShijin % 1800
        
        let gak = remainderAfterShik / 900
        
        var result = ""
        if shijin > 0 {
            result += "\(shijin)시진 "
        }
        if shikgyeong > 0 {
            result += "\(shikgyeong)식경 "
        }
        if gak > 0 {
            result += "\(gak)각 "
        }
        
        if result.isEmpty {
            let mins = total / 60
            if mins > 0 {
                return "\(mins)분 정진 중"
            } else {
                return "찰나(刹那)의 정진"
            }
        }
        
        return result + "정진"
    }
    
    public static func getOrientalTimeNarrative(date: Date = Date()) -> String {
        let calendar = Calendar.current
        let hour = calendar.component(.hour, from: date)
        
        let shijin: String
        switch hour {
        case 23, 0: shijin = "자시(子時) - 음기가 가장 강한 야심한 시기"
        case 1, 2: shijin = "축시(丑時) - 고요히 내공을 갈무리할 시기"
        case 3, 4: shijin = "인시(寅時) - 동 트기 전 호흡을 고르는 시기"
        case 5, 6: shijin = "묘시(卯時) - 붉은 해가 떠오르는 활력의 시기"
        case 7, 8: shijin = "진시(辰時) - 기혈의 순환이 충만해지는 시기"
        case 9, 10: shijin = "사시(巳時) - 정신의 또렷함이 배가되는 시기"
        case 11, 12: shijin = "오시(午時) - 양기가 극에 달해 만물이 깨어나는 시기"
        case 13, 14: shijin = "미시(未時) - 정오의 기운이 꺾이고 안정을 찾는 시기"
        case 15, 16: shijin = "신시(申時) - 하루의 집중력을 시험하는 정진의 시기"
        case 17, 18: shijin = "유시(酉時) - 노을과 함께 사색에 잠기는 시기"
        case 19, 20: shijin = "술시(戌時) - 어둠이 내려앉아 정신을 모으는 시기"
        case 21, 22: shijin = "해시(亥時) - 하루의 수련을 성찰하며 입선하는 시기"
        default: shijin = "자시(子時)"
        }
        
        var kyeong = ""
        switch hour {
        case 19, 20: kyeong = "초경(初更)"
        case 21, 22: kyeong = "이경(二更)"
        case 23, 0: kyeong = "삼경(三更)"
        case 1, 2: kyeong = "사경(四更)"
        case 3, 4: kyeong = "오경(五更)"
        default: kyeong = ""
        }
        
        if kyeong.isEmpty {
            return "지금은 \(shijin)라."
        } else {
            return "지금은 고막을 때리는 정적 속 \(kyeong), \(shijin)라."
        }
    }
}
