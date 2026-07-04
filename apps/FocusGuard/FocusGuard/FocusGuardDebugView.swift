import SwiftUI

struct FocusGuardDebugView: View {
    @ObservedObject var manager = FocusGuardManager.shared

    var body: some View {
        VStack(spacing: 8) {
            Button {
                withAnimation {
                    manager.isDebugPanelOpen.toggle()
                }
            } label: {
                HStack {
                    Image(systemName: "ladybug.fill")
                    Text(manager.isDebugPanelOpen ? "디버그 패널 닫기" : "디버그 패널 열기")
                }
                .font(.system(size: 14, weight: .bold))
                .padding(.vertical, 8)
                .padding(.horizontal, 16)
                .foregroundStyle(.white)
                .background(Color.red.opacity(0.8))
                .clipShape(Capsule())
            }
            .accessibilityIdentifier("debugPanelToggle")

            if manager.isDebugPanelOpen {
                VStack(spacing: 12) {
                    Text("개발자 모킹 도구 (FocusGuard)")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                    
                    HStack(spacing: 16) {
                        Button {
                            manager.isFacePresent = true
                        } label: {
                            Text("얼굴 감지 (Present)")
                                .font(.system(size: 14, weight: .semibold))
                                .padding(.vertical, 10)
                                .padding(.horizontal, 16)
                                .background(manager.isFacePresent ? Color.green : Color.gray)
                                .foregroundStyle(.white)
                                .cornerRadius(10)
                        }
                        .accessibilityIdentifier("debugFacePresentButton")

                        Button {
                            manager.isFacePresent = false
                        } label: {
                            Text("얼굴 이탈 (Absent)")
                                .font(.system(size: 14, weight: .semibold))
                                .padding(.vertical, 10)
                                .padding(.horizontal, 16)
                                .background(!manager.isFacePresent ? Color.orange : Color.gray)
                                .foregroundStyle(.white)
                                .cornerRadius(10)
                        }
                        .accessibilityIdentifier("debugFaceAbsentButton")
                    }
                    
                    VStack(alignment: .leading, spacing: 4) {
                        Text("현재 감지 상태: \(manager.isFacePresent ? "감지됨" : "이탈됨")")
                        Text("수련 상태: \(manager.state.rawValue)")
                        Text("이탈 누적 시간: \(String(format: "%.1f", manager.absentDuration))초")
                    }
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.8))
                }
                .padding(16)
                .background(Color.black.opacity(0.85))
                .cornerRadius(18)
                .overlay(
                    RoundedRectangle(cornerRadius: 18)
                        .stroke(Color.red.opacity(0.5), lineWidth: 1)
                )
            }
        }
        .padding(.vertical, 8)
    }
}
