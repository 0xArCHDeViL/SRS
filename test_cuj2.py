from playwright.sync_api import sync_playwright
import os

def run_cuj(page):
    page.goto("http://localhost:8080")
    page.wait_for_timeout(500)

    # 1. Click on the modeMenulis button
    page.locator("#modeMenulis").click()
    page.wait_for_timeout(500)

    # 2. Click start session on filter screen
    page.locator("#filterStart").click()
    page.wait_for_timeout(1000)

    # 4. Click the first kanji slot to open canvas
    slot = page.locator(".menulis-slot").first
    if slot:
        slot.click()
        page.wait_for_timeout(1000)

        # 6. Click Skip to mark as wrong and close modal and trigger fast skip animation
        page.locator("#canvasSkip").click()
        page.wait_for_timeout(2000) # Wait for fast animation/next card

    page.screenshot(path="/home/jules/verification/screenshots/verification_final3.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos",
            viewport={'width': 414, 'height': 896} # Mobile size, since app is mobile-first
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
