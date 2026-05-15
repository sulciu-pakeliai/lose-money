import { test, expect } from "../fixtures/auth";

test("top-up increases balance and shows confirmation", async ({ authedPage: page }) => {
    const balanceText = await page.getByText(/₵\s*[\d,]+/).first().textContent();
    const before = Number(balanceText?.replace(/[^\d]/g, "") ?? "0");

    await page.getByRole("button", { name: /top up balance/i }).click();
    await expect(page.getByRole("heading", { name: /top up/i })).toBeVisible();

    await page.getByRole("button", { name: "100" }).first().click();
    await page.getByRole("button", { name: /claim/i }).click();

    await expect(page.getByRole("button", { name: "Lobby", exact: true })).toBeVisible({ timeout: 10_000 });

    const afterText = await page.getByText(/₵\s*[\d,]+/).first().textContent();
    const after = Number(afterText?.replace(/[^\d]/g, "") ?? "0");
    expect(after).toBeGreaterThan(before);
});
