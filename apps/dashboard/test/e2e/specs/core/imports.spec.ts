import type { Locator, Page } from "@playwright/test";
import JSZip from "jszip";
import { expect, TRACKING_VERIFIED, test } from "@/test/e2e/fixtures";

const DASHBOARD_DOWNLOAD = {
	"visitors.csv":
		"date,visitors,pageviews,visits,views_per_visit,bounce_rate,visit_duration\n2026-03-04 09:00:00,2,4,2,2.0,50,40\n2026-03-04 13:00:00,3,3,3,1.0,100,0\n2026-03-04 18:00:00,1,2,1,2.0,0,60\n",
	"pages.csv":
		"name,visitors,pageviews,bounce_rate,time_on_page,scroll_depth\n/,4,6,50,20,40\n/pricing,2,3,0,30,60\n",
	"devices.csv": "name,visitors\nDesktop,4\nMobile,1\n",
};

async function zipBuffer(entries: Record<string, string>): Promise<Buffer> {
	const zip = new JSZip();
	for (const [name, contents] of Object.entries(entries)) {
		zip.file(name, contents);
	}
	return await zip.generateAsync({ type: "nodebuffer" });
}

async function dropFile(
	page: Page,
	target: Locator,
	file: { name: string; mimeType: string; buffer: Buffer }
) {
	const dataTransfer = await page.evaluateHandle(
		({ bytes, mimeType, name }) => {
			const transfer = new DataTransfer();
			transfer.items.add(
				new File([new Uint8Array(bytes)], name, { type: mimeType })
			);
			return transfer;
		},
		{ bytes: [...file.buffer], mimeType: file.mimeType, name: file.name }
	);
	await target.dispatchEvent("dragover", { dataTransfer });
	await target.dispatchEvent("drop", { dataTransfer });
}

test("checks a picked export before importing, then imports a dropped Plausible download", {
	tag: "@core",
}, async ({ authenticatedPage: page, e2eSession, mockRpc }) => {
	await mockRpc("websites/isTrackingSetup", TRACKING_VERIFIED);
	await page.goto(`/websites/${e2eSession.websiteId}/settings/import`);
	const startImport = page.getByRole("button", { name: "Start import" });
	const fileInput = page.locator('input[type="file"]');

	await fileInput.setInputFiles({
		name: "report.csv",
		mimeType: "text/csv",
		buffer: Buffer.from("name,value\nsignups,4\n"),
	});
	await expect(
		page.getByRole("alert").filter({ hasText: "isn't an export" })
	).toBeVisible();
	await expect(
		page.getByText("Databuddy can import these exports")
	).toBeVisible();
	await expect(startImport).toBeDisabled();

	await dropFile(page, page.getByText("report.csv"), {
		name: "Plausible export e2e.databuddy.local day.zip",
		mimeType: "application/zip",
		buffer: await zipBuffer(DASHBOARD_DOWNLOAD),
	});
	await expect(page.getByText(/^Plausible dashboard download/)).toBeVisible();
	await expect(page.locator("dl > div")).toHaveText([
		/^Period/,
		"Visitors5",
		"Pageviews9",
	]);
	await expect(startImport).toBeEnabled();

	await startImport.click();
	await expect(page.getByText("Import complete")).toBeVisible({
		timeout: 20_000,
	});
	await expect(
		page.getByRole("link", { name: "Open dashboard" })
	).toBeVisible();
});
