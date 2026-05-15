import { test, expect } from "@playwright/test";

test("new guest session shows initial balance and lobby", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Welcome to LoseMoney")).toBeVisible();
    await page.getByRole("button", { name: /continue as guest/i }).click();

    await expect(page.getByRole("button", { name: /lobby/i })).toBeVisible();
    await expect(page.getByText("Balance")).toBeVisible();
    await expect(page.getByText(/₵\s*[\d,]+/)).toBeVisible();
});
