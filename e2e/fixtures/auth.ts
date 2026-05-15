import { test as base, type Page } from "@playwright/test";

export type Credentials = { email: string; password: string };
export const test = base.extend<{
    credentials: Credentials;
    authedPage: Page;
}>({
    credentials: async ({}, use) => {
        const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await use({ email: `e2e_${tag}@example.com`, password: "E2ePassword1!" });
    },

    authedPage: async ({ page, credentials }, use) => {
        await page.request.post("/api/auth/register", {
            data: { email: credentials.email, password: credentials.password },
        });

        await page.addInitScript(() => {
            localStorage.setItem("lm_auth_seen_v1", "1");
            localStorage.setItem("lm_rules_seen_coinflip_v1", "1");
            localStorage.setItem("lm_rules_seen_blackjack_v1", "1");
            localStorage.setItem("lm_rules_seen_dice_v1", "1");
            localStorage.setItem("lm_rules_seen_roulette_v1", "1");
            localStorage.setItem("lm_rules_seen_slots_v1", "1");
            localStorage.setItem("lm_rules_seen_plinko_v1", "1");
            localStorage.setItem("lm_rules_seen_crash_v1", "1");
            localStorage.setItem("lm_rules_seen_mines_v1", "1");
        });

        await page.goto("/");
        await page.getByRole("button", { name: /lobby/i }).waitFor();

        await use(page);
    },
});

export { expect } from "@playwright/test";
