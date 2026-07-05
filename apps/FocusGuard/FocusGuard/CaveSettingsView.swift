import SwiftUI

struct CaveSettingsView: View {
    @ObservedObject var store: StudySessionStore
    @State private var showingResetAlert = false

    var body: some View {
        ZStack {
            caveBackground

            ScrollView {
                VStack(spacing: 20) {
                    headerBlock
                    focusGuardSettingsSection
                    soundscapeSettingsSection
                    progressCycleSettingsSection
                    developerTestSection
                    resetSection
                    appInfoBlock
                }
                .padding(20)
            }
        }
        .alert("수련 기록 초기화", isPresented: $showingResetAlert) {
            Button("초기화", role: .destructive) {
                store.resetAllData()
            }
            Button("취소", role: .cancel) {}
        } message: {
            Text("지금껏 누적된 모든 수련 기록과 장부가 영구히 삭제됩니다. 정말 초기화하시겠습니까?")
        }
    }

    private var caveBackground: some View {
        LinearGradient(
            colors: [CaveTheme.backgroundTop, CaveTheme.backgroundBottom],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    private var headerBlock: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("설정 및 제단")
                .font(.system(size: 32, weight: .black, design: .serif))
                .foregroundStyle(.white)
            Text("수련 환경을 다스리고 재조율합니다.")
                .font(.system(size: 15, weight: .medium, design: .serif))
                .foregroundStyle(.white.opacity(0.64))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 10)
    }

    private var focusGuardSettingsSection: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Image(systemName: "eye.trianglebadge.exclamationmark.fill")
                    .foregroundStyle(CaveTheme.gold)
                Text("집중 감시 (Focus Guard)")
                    .font(.system(size: 17, weight: .bold, design: .serif))
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, 4)

            VStack(spacing: 16) {
                Toggle(isOn: $store.isFocusGuardActive) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("집중 감시 활성화")
                            .font(.system(size: 15, weight: .semibold, design: .serif))
                            .foregroundStyle(.white)
                        Text("시선 이탈 시 경고 및 세션을 정지시킵니다.")
                            .font(.system(size: 12))
                            .foregroundStyle(.white.opacity(0.45))
                    }
                }
                .tint(CaveTheme.gold)

                Divider().background(Color.white.opacity(0.08))

                Toggle(isOn: $store.isMockCameraEnabledSetting) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("가상 카메라 모드 (Mock)")
                            .font(.system(size: 15, weight: .semibold, design: .serif))
                            .foregroundStyle(.white)
                        Text("테스트 및 시뮬레이션을 위한 디버그 패널을 노출합니다.")
                            .font(.system(size: 12))
                            .foregroundStyle(.white.opacity(0.45))
                    }
                }
                .tint(CaveTheme.gold)

                if store.isFocusGuardActive {
                    Group {
                        Divider().background(Color.white.opacity(0.08))
                        
                        Toggle(isOn: $store.isSpeechEnabled) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("음성 경고 (TTS)")
                                    .font(.system(size: 15, weight: .semibold, design: .serif))
                                    .foregroundStyle(.white)
                                Text("이탈 시 목소리로 집중 경고를 출력합니다.")
                                    .font(.system(size: 12))
                                    .foregroundStyle(.white.opacity(0.45))
                            }
                        }
                        .tint(CaveTheme.gold)

                        Divider().background(Color.white.opacity(0.08))

                        // Sliders for customization
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("준비 유예 시간 (Grace Period)")
                                    .font(.system(size: 14, weight: .semibold, design: .serif))
                                    .foregroundStyle(.white.opacity(0.85))
                                Spacer()
                                Text("\(Int(store.startupGraceSetting))초")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundStyle(CaveTheme.jade)
                            }
                            Slider(value: $store.startupGraceSetting, in: 1...30, step: 1)
                                .tint(CaveTheme.gold)
                        }

                        Divider().background(Color.white.opacity(0.08))

                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("경고 시간 (Warning Threshold)")
                                    .font(.system(size: 14, weight: .semibold, design: .serif))
                                    .foregroundStyle(.white.opacity(0.85))
                                Spacer()
                                Text("\(Int(store.warningThresholdSetting))초")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundStyle(CaveTheme.ember)
                            }
                            Slider(value: $store.warningThresholdSetting, in: 1...15, step: 1)
                                .tint(CaveTheme.gold)
                        }

                        Divider().background(Color.white.opacity(0.08))

                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("실패 패널티 시간 (Fail Threshold)")
                                    .font(.system(size: 14, weight: .semibold, design: .serif))
                                    .foregroundStyle(.white.opacity(0.85))
                                Spacer()
                                Text("\(Int(store.failThresholdSetting))초")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundStyle(.red)
                            }
                            Slider(value: $store.failThresholdSetting, in: 5...60, step: 1)
                                .tint(CaveTheme.gold)
                        }
                    }
                }
            }
            .padding(20)
            .background(stonePanel)
        }
    }

    private var soundscapeSettingsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Image(systemName: "music.note")
                    .foregroundStyle(CaveTheme.gold)
                Text("배경 사운드테라피")
                    .font(.system(size: 17, weight: .bold, design: .serif))
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, 4)

            VStack(spacing: 16) {
                Picker("배경음", selection: $store.selectedSoundscape) {
                    Text("없음").tag("없음")
                    Text("동굴 낙수 소리 (洞穴落水)").tag("동굴 낙수 소리")
                    Text("차분한 대나무 바람 (竹林淸風)").tag("차분한 대나무 바람")
                    Text("이무기 심연 우레음 (黑雷深淵)").tag("이무기 심연 우레음")
                    Text("수호신룡 천룡명상 (天龍梵鐘)").tag("수호신룡 천룡명상")
                    Text("화기린 겁화 모닥불 (劫火木火)").tag("화기린 겁화 모닥불")
                    Text("대붕 설산 바람소리 (雪山冰風)").tag("대붕 설산 바람소리")
                    Text("용귀 파도 동종소리 (龍龜海鐘)").tag("용귀 파도 동종소리")
                    Text("백호 포효 바람소리 (白虎風嘯)").tag("백호 포효 바람소리")
                }
                .pickerStyle(.menu)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.white.opacity(0.06))
                .cornerRadius(12)
                .accentColor(CaveTheme.gold)
                
                Text("집중력 증진을 위한 명상 및 뇌파 동조용 배경 소리입니다.")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.45))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(20)
            .background(stonePanel)
        }
    }

    private var progressCycleSettingsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Image(systemName: "gauge.with.needle.fill")
                    .foregroundStyle(CaveTheme.gold)
                Text("수련 내공 주기 (修練內功週期)")
                    .font(.system(size: 17, weight: .bold, design: .serif))
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, 4)

            VStack(spacing: 16) {
                Picker("내공 주기", selection: $store.progressCycleType) {
                    Text("1각 (15분)").tag("1각 (15분)")
                    Text("1식경 (30분)").tag("1식경 (30분)")
                }
                .pickerStyle(.segmented)
                .background(Color.white.opacity(0.05))
                .cornerRadius(8)
                
                Text("잠금화면 황금색 실선 바가 가득 차오르는 주기입니다. 선택한 시간 단위(각 혹은 식경)를 돌파할 때마다 황금 내공 바가 꽉 차오르며 순환합니다.")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.45))
                    .frame(maxWidth: .infinity, alignment: .leading)
                
                Divider().background(Color.white.opacity(0.08))

                Toggle(isOn: $store.isBreakthroughFeedbackEnabled) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("내공 돌파 알림 (內功突破)")
                            .font(.system(size: 15, weight: .semibold, design: .serif))
                            .foregroundStyle(.white)
                        Text("각 또는 식경 돌파 시 맑은 경쇠 종소리와 햅틱 진동을 울립니다.")
                            .font(.system(size: 12))
                            .foregroundStyle(.white.opacity(0.45))
                    }
                }
                .tint(CaveTheme.gold)
            }
            .padding(20)
            .background(stonePanel)
        }
    }

    private var developerTestSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Image(systemName: "hammer.fill")
                    .foregroundStyle(CaveTheme.jade)
                Text("개발자 테스트 (Developer)")
                    .font(.system(size: 17, weight: .bold, design: .serif))
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, 4)
            
            VStack(spacing: 14) {
                Toggle(isOn: $store.isDevAllMapsUnlocked) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("모든 강호 지역 즉시 해제")
                            .font(.system(size: 15, weight: .semibold, design: .serif))
                            .foregroundStyle(.white)
                        Text("공력·비경 잠금 없이 전 지역 NPC·비무·테마 동화 테스트")
                            .font(.system(size: 12))
                            .foregroundStyle(.white.opacity(0.45))
                    }
                }
                .tint(CaveTheme.jade)
                
                Divider().background(Color.white.opacity(0.08))
                
                Button {
                    store.applyDeveloperUnlockAll()
                } label: {
                    devActionLabel(title: "일괄 해제 + 진기 9999", icon: "map.fill")
                }
                
                Button {
                    store.grantDeveloperGongryeokPoints(500)
                } label: {
                    devActionLabel(title: "진기 500 眞 추가", icon: "sparkles")
                }
                
                Button {
                    store.resetDeveloperSparringProgress()
                } label: {
                    devActionLabel(title: "오늘 비무 기록 초기화", icon: "arrow.counterclockwise")
                }
                
                Text("지도 탭에서 모든 지역·영약전·비무 기능을 바로 확인할 수 있습니다.")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.45))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(20)
            .background(stonePanel)
        }
    }
    
    private func devActionLabel(title: String, icon: String) -> some View {
        HStack {
            Image(systemName: icon)
            Text(title)
            Spacer()
        }
        .font(.system(size: 14, weight: .semibold, design: .serif))
        .foregroundStyle(CaveTheme.jade)
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(CaveTheme.jade.opacity(0.1))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(CaveTheme.jade.opacity(0.25), lineWidth: 1)
                )
        )
    }

    private var resetSection: some View {
        Button {
            showingResetAlert = true
        } label: {
            HStack {
                Image(systemName: "trash")
                Text("수련 기록 전체 초기화")
            }
            .font(.system(size: 16, weight: .bold, design: .serif))
            .foregroundStyle(.red)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Color.red.opacity(0.08))
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .strokeBorder(Color.red.opacity(0.24), lineWidth: 1)
                    )
            )
        }
    }

    private var appInfoBlock: some View {
        VStack(spacing: 6) {
            Text("폐관수련 FocusGuard v1.0.0")
                .font(.system(size: 13, weight: .semibold, design: .serif))
                .foregroundStyle(.white.opacity(0.4))
            Text("© 2026 BlackLAB. All rights reserved.")
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.25))
        }
        .padding(.vertical, 20)
    }

    private var stonePanel: some View {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [CaveTheme.panel.opacity(0.85), CaveTheme.panelSoft.opacity(0.92)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .strokeBorder(.white.opacity(0.05), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.2), radius: 12, x: 0, y: 8)
    }
}
