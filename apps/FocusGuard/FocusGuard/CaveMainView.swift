import SwiftUI

struct CaveMainView: View {
    @ObservedObject var store: StudySessionStore
    @State private var selectedTab = 0

    var body: some View {
        ZStack(alignment: .bottom) {
            // View Switcher with smooth transition
            Group {
                switch selectedTab {
                case 0:
                    CaveHomeView(store: store)
                case 1:
                    CaveMapView(store: store)
                case 2:
                    CaveHistoryView(store: store)
                case 3:
                    CaveSettingsView(store: store)
                default:
                    CaveHomeView(store: store)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.bottom, 80) // Leave space for custom tab bar

            // Custom Tab Bar
            customTabBar
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .onChange(of: selectedTab) { newTab in
            FocusGuardManager.shared.isSuspended = (newTab != 0)
        }
    }

    private var customTabBar: some View {
        VStack(spacing: 0) {
            Divider()
                .background(Color.white.opacity(0.06))

            HStack {
                tabButton(index: 0, text: "修", label: "수련실", icon: "bolt.shield")
                Spacer()
                tabButton(index: 1, text: "圖", label: "지도", icon: "map")
                Spacer()
                tabButton(index: 2, text: "簿", label: "장부", icon: "doc.text.magnifyingglass")
                Spacer()
                tabButton(index: 3, text: "設", label: "설정", icon: "slider.horizontal.3")
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(
                LinearGradient(
                    colors: [CaveTheme.panel.opacity(0.92), CaveTheme.panelSoft.opacity(0.98)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
        }
        .frame(height: 80)
        .shadow(color: .black.opacity(0.4), radius: 10, x: 0, y: -4)
    }

    private func tabButton(index: Int, text: String, label: String, icon: String) -> some View {
        Button {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                selectedTab = index
            }
        } label: {
            VStack(spacing: 4) {
                ZStack {
                    if selectedTab == index {
                        Circle()
                            .fill(CaveTheme.gold.opacity(0.12))
                            .frame(width: 44, height: 44)
                            .transition(.scale.combined(with: .opacity))
                    }
                    
                    VStack(spacing: 1) {
                        Text(text)
                            .font(.system(size: 20, weight: .bold, design: .serif))
                            .foregroundStyle(selectedTab == index ? CaveTheme.gold : .white.opacity(0.4))
                    }
                }
                .frame(height: 32)
                
                Text(label)
                    .font(.system(size: 11, weight: .semibold, design: .serif))
                    .foregroundStyle(selectedTab == index ? .white : .white.opacity(0.4))
            }
        }
        .frame(width: 60)
    }
}
