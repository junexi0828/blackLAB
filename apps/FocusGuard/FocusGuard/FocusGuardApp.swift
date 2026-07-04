import SwiftUI

@main
struct FocusGuardApp: App {
    @StateObject private var store = StudySessionStore()

    var body: some Scene {
        WindowGroup {
            CaveMainView(store: store)
        }
    }
}

