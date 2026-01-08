import path from "path";
import puppeteer, { Browser, Page } from "puppeteer";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, "..");

export class BrowserAutomation {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private userDataDir: string;

  constructor() {
    // Store browser data in a local folder for persistent login
    // Using absolute path so it works when called from anywhere
    this.userDataDir = path.resolve(ROOT_DIR, ".user_data");
  }

  async init(headless: boolean = false) {
    this.browser = await puppeteer.launch({
      headless,
      userDataDir: this.userDataDir,
      defaultViewport: { width: 1280, height: 800 },
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    this.page = await this.browser.newPage();
  }

  async goto(url?: string) {
    if (!this.page) throw new Error("Browser not initialized");
    const targetUrl = (url ?? process.env.PROTIME_URL)?.replace(/\/+$/, "");
    if (!targetUrl) {
      throw new Error("Missing PROTIME_URL in environment");
    }
    await this.page.goto(targetUrl, { waitUntil: "networkidle2" });
  }

  async login() {
    if (!this.page) throw new Error("Browser not initialized");

    const email = process.env.USER_EMAIL;
    const password = process.env.USER_PASSWORD;

    if (!email || !password) {
      console.error(
        "Credentials missing in .env file (USER_EMAIL, USER_PASSWORD)",
      );
      return false;
    }

    try {
      console.log("Attempting automated login...");
      await this.page.waitForSelector("#Email", { timeout: 10000 });
      await this.page.type("#Email", email);
      await this.page.type("#Password", password);

      // Look for the submit button - typically the next button or a submit input
      // Since specific selector for button was not provided, we press Enter or find first submit
      await this.page.keyboard.press("Enter");

      // Wait for navigation after login
      await this.page.waitForNavigation({ waitUntil: "networkidle2" });
      return true;
    } catch (error) {
      console.log("Login form not found or already logged in.");
      return false;
    }
  }

  async click(selector: string) {
    if (!this.page) throw new Error("Browser not initialized");
    await this.page.waitForSelector(selector);
    await this.page.click(selector);
  }

  async type(selector: string, text: string) {
    if (!this.page) throw new Error("Browser not initialized");
    await this.page.waitForSelector(selector);
    await this.page.type(selector, text);
  }

  async wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  getPage() {
    return this.page;
  }
}
