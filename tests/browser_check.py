"""Manual browser verification against a running second-round dashboard."""
from pathlib import Path
from playwright.sync_api import sync_playwright

Path('artifacts').mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:8000')
    page.wait_for_function("document.querySelector('#state').options.length === 27")
    page.wait_for_selector('#states .runoff-card', timeout=120000)
    assert page.locator('#states .runoff-card').count() == 27
    page.locator('#map-role').select_option('governor')
    page.locator('#state-search').fill('Acre')
    assert page.locator('#states .runoff-card').count() == 1
    page.locator('#state-search').fill('')
    page.locator('#state').select_option('df')
    page.wait_for_function("document.querySelector('#local-title').textContent.includes('Distrito Federal')")
    page.screenshot(path='artifacts/desktop-runoff.png', full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path='artifacts/mobile-runoff.png', full_page=True)
    assert not errors, errors
    print('Second-round dashboard: states, search, map selector and mobile layout OK')
    browser.close()
