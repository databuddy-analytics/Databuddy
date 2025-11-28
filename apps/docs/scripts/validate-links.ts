import type { InferPageType } from "fumadocs-core/source";
import {
    type FileObject,
    printErrors,
    scanURLs,
    validateFiles,
} from "next-validate-link";
import { source } from "../lib/source";

type Page = InferPageType<typeof source>;

const getHeadings = (page: Page): string[] =>
    page.data.toc?.map((item) => item.url.slice(1)) ?? [];

const getFiles = (): Promise<FileObject[]> =>
    Promise.all(
        source.getPages().map(async (page) => ({
            path: page.file.path,
            content: await page.data.getText("raw"),
            url: page.url,
            data: page.data,
        }))
    );

async function checkLinks() {
    const pages = source.getPages();

    const scanned = await scanURLs({
        preset: "next",
        populate: {
            "docs/[[...slug]]": pages.map((page) => ({
                value: { slug: page.slugs },
                hashes: getHeadings(page),
            })),
        },
    });

    const errors = await validateFiles(await getFiles(), {
        scanned,
        markdown: {
            components: {
                Card: { attributes: ["href"] },
                Cards: { attributes: ["href"] },
                Link: { attributes: ["href"] },
            },
        },
        checkRelativePaths: "as-url",
    });

    printErrors(errors, true);

    if (errors.length > 0) {
        process.exit(1);
    }
}

checkLinks().catch(console.error);
