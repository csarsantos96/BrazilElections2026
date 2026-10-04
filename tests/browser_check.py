"""Manual browser verification against a running local server."""
from pathlib import Path
from playwright.sync_api import sync_playwright

Path("artifacts").mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("http://127.0.0.1:8000")
    page.wait_for_selector("#president .candidate", timeout=60000)
    page.wait_for_selector("#regional .candidate", timeout=60000)
    page.wait_for_function("document.querySelector('#municipality').options.length > 2")
    page.screenshot(path="artifacts/desktop.png", full_page=True)
    assert page.locator("#president .candidate").count() > 0
    page.get_by_role("tab", name="Senador", exact=True).click()
    assert page.locator("[data-role='5']").get_attribute("aria-selected") == "true"
    page.locator("#search").fill("NOME INEXISTENTE TESTE")
    assert page.locator("#regional").inner_text().find("Nenhum candidato encontrado") >= 0
    page.locator("#search").fill("")
    page.locator("#municipality").select_option("01120")
    page.wait_for_selector("#local:not([hidden]) .candidate", timeout=60000)
    assert "ACREL" in page.locator("#local-label").inner_text()
    page.set_viewport_size({"width": 390, "height": 844})
    page.screenshot(path="artifacts/mobile.png", full_page=True)
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.locator("#state").select_option("df")
    page.wait_for_function("document.querySelector('#deputy-tab').textContent === 'Dep. distrital'")
    page.wait_for_selector("#regional .candidate", timeout=60000)
    page.get_by_role("tab", name="Dep. distrital").click()
    assert page.locator("#regional .candidate").count() > 0
    assert not errors, errors
    print("Desktop/mobile, municipalities, tabs, search and DF: OK")
    browser.close()
