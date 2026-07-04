import ActivityKit
import Foundation

struct FocusStudyAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var sessionStartedAt: Date
        var totalStudySeconds: TimeInterval
        var todayStudySeconds: TimeInterval
        var currentSessionSeconds: TimeInterval
        var isRunning: Bool
        var isPaused: Bool
        var updatedAt: Date
        var currentBeastImageName: String
    }

    var title: String
}

enum FocusStudyLiveActivity {
    static let activityTitle = "폐관수련"
}
