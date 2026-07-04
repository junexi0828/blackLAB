import XCTest

@MainActor
final class FocusGuardUITests: XCTestCase {
    private let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launchEnvironment["FOCUSGUARD_MOCK_CAMERA"] = "1"
        app.launchEnvironment["FOCUSGUARD_DISABLE_SPEECH"] = "1"
        app.launchEnvironment["FOCUSGUARD_STARTUP_GRACE_SECONDS"] = "1"
        app.launchEnvironment["FOCUSGUARD_WARNING_THRESHOLD_SECONDS"] = "2"
        app.launchEnvironment["FOCUSGUARD_FAIL_THRESHOLD_SECONDS"] = "6"
        app.launch()
    }

    func testWarningAppearsWhenMockFaceDisappears() throws {
        startSession()
        hideMockFace()

        XCTAssertTrue(
            app.staticTexts["guardStateTitle"].waitForExistence(timeout: 4)
        )
        XCTAssertEqual(app.staticTexts["guardStateTitle"].label, "경고")
    }

    func testFailureAppearsWhenMockFaceStaysAbsent() throws {
        startSession()
        hideMockFace()

        XCTAssertTrue(
            app.staticTexts["resultTitle"].waitForExistence(timeout: 8)
        )
        XCTAssertEqual(app.staticTexts["resultTitle"].label, "실패")
    }

    func testFocusRecoversWhenMockFaceReturns() throws {
        startSession()
        hideMockFace()
        XCTAssertTrue(app.staticTexts["guardStateTitle"].waitForExistence(timeout: 4))
        XCTAssertEqual(app.staticTexts["guardStateTitle"].label, "경고")

        showMockFace()

        let summary = app.staticTexts["sessionSummaryText"]
        XCTAssertTrue(summary.waitForExistence(timeout: 3))
        XCTAssertEqual(summary.label, "집중 상태가 정상입니다.")
    }

    private func startSession() {
        let startButton = app.buttons["startSessionButton"]
        XCTAssertTrue(startButton.waitForExistence(timeout: 12))
        startButton.tap()
        openDebugPanelIfNeeded()
    }

    private func openDebugPanelIfNeeded() {
        let toggle = app.buttons["debugPanelToggle"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 12))
        toggle.tap()
    }

    private func hideMockFace() {
        let button = app.buttons["debugFaceAbsentButton"]
        XCTAssertTrue(button.waitForExistence(timeout: 12))
        button.tap()
    }

    private func showMockFace() {
        let button = app.buttons["debugFacePresentButton"]
        XCTAssertTrue(button.waitForExistence(timeout: 12))
        button.tap()
    }
}
