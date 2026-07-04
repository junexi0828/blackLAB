import Foundation

struct SharedCaveSnapshot: Codable, Hashable {
    var totalStudySeconds: TimeInterval
    var todayStudySeconds: TimeInterval
    var currentSessionSeconds: TimeInterval
    var isRunning: Bool
    var isPaused: Bool
    var accumulatedTime: TimeInterval
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
