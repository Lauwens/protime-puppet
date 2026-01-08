#!/usr/bin/env bun
import { Command } from "commander";
import dotenv from "dotenv";
import path from "path";
import { BrowserAutomation, ROOT_DIR } from "./browser.js";

dotenv.config({ path: path.resolve(ROOT_DIR, ".env") });

const program = new Command();
const TARGET_URL = process.env.PROTIME_URL?.replace(/\/+$/, "");
if (!TARGET_URL) {
  console.error(
    "Missing PROTIME_URL in .env (e.g. https://trescal.myprotime.eu)",
  );
  process.exit(1);
}

program
  .name("protime-puppet")
  .description("CLI for automating Trescal MyProtime")
  .version("1.0.0");

program
  .command("login")
  .description("Perform automated login or open browser for manual login")
  .option("-m, --manual", "Open browser for manual login", false)
  .action(async (options) => {
    const automation = new BrowserAutomation();
    await automation.init(false); // Open in headful for login
    await automation.goto(TARGET_URL);

    if (options.manual) {
      console.log("Manual login mode. Please log in in the browser.");
    } else {
      const success = await automation.login();
      if (success) {
        console.log("Automated login successful.");
      } else {
        console.log(
          "Automated login failed or already logged in. Please verify manually if needed.",
        );
      }
    }

    console.log("Finalizing...");
    const page = automation.getPage();
    if (page) {
      page.on("close", async () => {
        console.log("Browser closed.");
        process.exit(0);
      });
    }

    console.log("Keep the browser open? (Press Ctrl+C to exit)");
  });

program
  .command("clock")
  .description("Run automation on the calendar (automated login if needed)")
  .action(async () => {
    const automation = new BrowserAutomation();
    try {
      console.log(`Navigating to ${TARGET_URL}...`);
      await automation.init(true); // Headless for run
      await automation.goto(TARGET_URL + "/calendar/person/me");

      // Try to login if we see the login form
      await automation.login();

      const page = automation.getPage();
      if (!page) throw new Error("Failed to open page");

      console.log("Successfully reached the calendar page.");

      // 1. Calculate today's ISO date (YYYY-MM-DD)
      const todayISO = new Date().toISOString().split("T")[0];
      const cellSelector = `[data-testid="cell-${todayISO}"]`;
      console.log(`Looking for current day cell: ${cellSelector}`);

      // 2. Wait for the cell and find the button inside it
      await page.waitForSelector(cellSelector, { timeout: 10000 });
      const cell = await page.$(cellSelector);
      if (!cell)
        throw new Error(`Could not find today's cell (${cellSelector})`);

      const button = await cell.$("button");
      if (!button) throw new Error("Could not find a button inside the cell");

      console.log("Clicking the button in the calendar cell...");
      await button.click();

      // 3. Wait for the context menu to appear
      console.log("Waiting for context menu...");
      const menuSelector = '[data-testid="context-menu"]';
      await page.waitForSelector(menuSelector, { timeout: 10000 });

      // 4. Click the "Bekijk dagdetails" option
      const itemSelector = '[data-testid="contextItem_Bekijk dagdetails"]';
      console.log(`Clicking menu item: ${itemSelector}`);
      await page.waitForSelector(itemSelector, { timeout: 10000 });
      await page.click(itemSelector);

      // CRITICAL: Wait for the side panel to appear before checking status
      const panelAddButton = '[data-testid="day-detail-options"]';
      console.log("Waiting for detail panel to open...");
      await page.waitForSelector(panelAddButton, { timeout: 15000 });

      // Determine if we should check in or out based on the time
      const checkIn = new Date().getHours() < 10;

      const now = new Date();
      const formatTime = (d: Date) =>
        d.getHours().toString().padStart(2, "0") +
        ":" +
        d.getMinutes().toString().padStart(2, "0");

      const timeToType = !checkIn
        ? formatTime(new Date(now.getTime() + 5 * 60000)) // 5 mins ahead
        : formatTime(new Date(now.getTime() - 5 * 60000)); // 5 mins before

      if (checkIn) {
        console.log(`First time entry, setting absence (Thuiswerk)`);

        // Click the "Add" Button
        console.log(`Clicking add item: ${panelAddButton}`);
        await page.click(panelAddButton);

        // Click the "Boeking aanvragen" option
        const absenceSelector = '[data-testid="RequestAbsence-option"]';
        console.log(
          `Clicking Afwezigheid aanvragen menu item: ${absenceSelector}`,
        );
        await page.waitForSelector(absenceSelector, { timeout: 10000 });
        await page.click(absenceSelector);

        // Select thuiswerk option
        console.log('Selecting "Thuiswerk" from dropdown...');
        const selectSelector = "#definitionId";
        await page.waitForSelector(selectSelector, { timeout: 10000 });

        await page.evaluate(() => {
          const select = document.querySelector(
            "#definitionId",
          ) as HTMLSelectElement;
          const options = Array.from(select.options);
          const targetOption = options.find(
            (opt) => opt.text.trim() === "Thuiswerk",
          );

          if (targetOption) {
            select.value = targetOption.value;
            // Trigger change events so the site's logic reacts to the selection
            select.dispatchEvent(new Event("change", { bubbles: true }));
            select.dispatchEvent(new Event("input", { bubbles: true }));
          } else {
            throw new Error('Option "Thuiswerk" not found in dropdown');
          }
        });

        await page.evaluate(() => {
          const select = document.querySelector(
            "#durationType",
          ) as HTMLSelectElement;
          const options = Array.from(select.options);
          const targetOption = options.find(
            (opt) => opt.text.trim() === "Duurtijd",
          );

          if (targetOption) {
            select.value = targetOption.value;
            // Trigger change events so the site's logic reacts to the selection
            select.dispatchEvent(new Event("change", { bubbles: true }));
            select.dispatchEvent(new Event("input", { bubbles: true }));
          } else {
            throw new Error('Option "Duration" not found in dropdown');
          }
        });

        // 7. Type the time into the specific input
        const durationInputSelector = "#duration";
        console.log(`Waiting for duration input: ${durationInputSelector}`);
        await page.waitForSelector(durationInputSelector, { timeout: 10000 });

        // Click to ensure focus and clear potential default values
        await page.click(durationInputSelector, { clickCount: 3 });
        await page.keyboard.press("Backspace");

        console.log(`Typing time: 8:00`);
        await page.type(durationInputSelector, "8:00", { delay: 100 });

        await page.keyboard.press("Enter");

        // Submit the absence form
        console.log("Submitting absence request...");
        await page.keyboard.press("Enter");
        await automation.wait(2000); // Brief wait for the form to close/process
      }

      // 5. Always add the clocking entry
      console.log(`Clicking add item for clocking: ${panelAddButton}`);
      await page.waitForSelector(panelAddButton, { timeout: 10000 });
      await page.click(panelAddButton);

      // 6. Click the "Boeking aanvragen" option
      const boekingSelector = '[data-testid="RequestClocking-option"]';

      console.log(`Clicking Boeking aanvragen menu item: ${boekingSelector}`);
      await page.waitForSelector(boekingSelector, { timeout: 10000 });
      await page.click(boekingSelector);

      // 7. Type the time into the specific input
      const timeInputSelector = "#time";
      console.log(`Waiting for time input: ${timeInputSelector}`);
      await page.waitForSelector(timeInputSelector, { timeout: 10000 });

      // Click to ensure focus and clear potential default values
      await page.click(timeInputSelector, { clickCount: 3 });
      await page.keyboard.press("Backspace");

      console.log(`Typing time: ${timeToType}`);
      await page.type(timeInputSelector, timeToType, { delay: 100 });

      //await page.keyboard.press("Enter");

      console.log("Automation steps completed successfully.");
      await automation.wait(5000); // Increased wait to see the final input before closing
    } catch (error) {
      console.error("Operation failed:", error);
    } finally {
      await automation.close();
    }
  });

program.parse();
