import type { Metadata } from 'next';
import { Footer } from '@/components/footer';
import Section from '@/components/landing/section';
import { Spotlight } from '@/components/landing/spotlight';
import ActivityStats from './activity-stats';
import CodeChurnChart from './code-churn-chart';
import CommitActivityChart from './commit-activity-chart';
import ContributorsGrid from './contributors-grid';
import ContributorsHero from './contributors-hero';
import PunchCardHeatmap from './punch-card-heatmap';
import ReleasesTimeline from './releases-timeline';

export const metadata: Metadata = {
	title: 'Contributors | Databuddy',
	description:
		'Meet the amazing developers building the future of privacy-first analytics',
};

// GitHub API interfaces
interface GitHubRepo {
	stargazers_count: number;
	forks_count: number;
	open_issues_count: number;
	watchers_count: number;
	language: string;
}

interface GitHubContributor {
	login: string;
	id: number;
	avatar_url: string;
	html_url: string;
	contributions: number;
	type: string;
}

interface GitHubLanguages {
	[key: string]: number;
}

interface GitHubPullRequest {
	state: 'open' | 'closed';
	merged_at: string | null;
}

interface GitHubCommitActivity {
	days: number[];
	total: number;
	week: number;
}

interface ProcessedCommitActivity {
	week: string;
	commits: number;
	date: Date;
}

interface GitHubCodeFrequency {
	0: number; // timestamp
	1: number; // additions
	2: number; // deletions
}

interface ProcessedCodeFrequency {
	week: string;
	additions: number;
	deletions: number;
	date: Date;
}

interface GitHubPunchCard {
	0: number; // day of week (0-6, Sunday is 0)
	1: number; // hour of day (0-23)
	2: number; // number of commits
}

interface ProcessedPunchCard {
	day: number;
	hour: number;
	commits: number;
	dayName: string;
}

interface GitHubRelease {
	tag_name: string;
	name: string;
	published_at: string;
	prerelease: boolean;
	draft: boolean;
}

interface ProcessedRelease {
	name: string;
	tagName: string;
	publishedAt: string;
	date: Date;
	isPrerelease: boolean;
}

function fetchWithRetry(
	url: string,
	options: RequestInit,
	maxRetries = 3
): Promise<Response> {
	async function attemptFetch(attempt: number): Promise<Response> {
		const response = await fetch(url, options);

		if (response.status === 202 && attempt < maxRetries) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
			return attemptFetch(attempt + 1);
		}

		return response;
	}

	return attemptFetch(1);
}

async function fetchBasicRepoData(requestInit: RequestInit) {
	// Fetch repository info
	const repoResponse = await fetch(
		'https://api.github.com/repos/databuddy-analytics/Databuddy',
		requestInit
	);
	if (!repoResponse.ok) {
		throw new Error(`Failed to fetch repo: ${repoResponse.status}`);
	}
	return await repoResponse.json();
}

async function fetchContributorsData(requestInit: RequestInit) {
	const contributorsResponse = await fetch(
		'https://api.github.com/repos/databuddy-analytics/Databuddy/contributors?per_page=100',
		requestInit
	);
	if (!contributorsResponse.ok) {
		throw new Error(
			`Failed to fetch contributors: ${contributorsResponse.status}`
		);
	}
	const contributorsData = await contributorsResponse.json();
	return Array.isArray(contributorsData) ? contributorsData : [];
}

async function fetchLanguagesData(requestInit: RequestInit) {
	const languagesResponse = await fetch(
		'https://api.github.com/repos/databuddy-analytics/Databuddy/languages',
		requestInit
	);
	if (!languagesResponse.ok) {
		throw new Error(`Failed to fetch languages: ${languagesResponse.status}`);
	}
	return await languagesResponse.json();
}

async function fetchPullRequestsData(requestInit: RequestInit) {
	const prsResponse = await fetch(
		'https://api.github.com/repos/databuddy-analytics/Databuddy/pulls?state=all&per_page=100',
		requestInit
	);
	if (!prsResponse.ok) {
		throw new Error(`Failed to fetch PRs: ${prsResponse.status}`);
	}
	const prsData = await prsResponse.json();
	return Array.isArray(prsData) ? prsData : [];
}

async function fetchCommitActivity(
	statsRequestInit: RequestInit
): Promise<ProcessedCommitActivity[]> {
	try {
		const response = await fetchWithRetry(
			'https://api.github.com/repos/databuddy-analytics/Databuddy/stats/commit_activity',
			statsRequestInit
		);

		if (response.ok) {
			const data: GitHubCommitActivity[] = await response.json();
			if (Array.isArray(data)) {
				return data.map((week) => ({
					week: new Date(week.week * 1000).toISOString().split('T')[0],
					commits: week.total,
					date: new Date(week.week * 1000),
				}));
			}
		}
	} catch (error) {
		console.error('Failed to fetch commit activity:', error);
	}
	return [];
}

async function fetchCodeFrequency(
	statsRequestInit: RequestInit
): Promise<ProcessedCodeFrequency[]> {
	try {
		const response = await fetchWithRetry(
			'https://api.github.com/repos/databuddy-analytics/Databuddy/stats/code_frequency',
			statsRequestInit
		);

		if (response.ok) {
			const data: GitHubCodeFrequency[] = await response.json();
			if (Array.isArray(data)) {
				return data.map((week) => ({
					week: new Date(week[0] * 1000).toISOString().split('T')[0],
					additions: week[1],
					deletions: Math.abs(week[2]), // Make deletions positive for display
					date: new Date(week[0] * 1000),
				}));
			}
		}
	} catch (error) {
		console.error('Failed to fetch code frequency:', error);
	}
	return [];
}

async function fetchPunchCard(
	statsRequestInit: RequestInit
): Promise<ProcessedPunchCard[]> {
	try {
		const response = await fetchWithRetry(
			'https://api.github.com/repos/databuddy-analytics/Databuddy/stats/punch_card',
			statsRequestInit
		);

		if (response.ok) {
			const data: GitHubPunchCard[] = await response.json();
			if (Array.isArray(data)) {
				const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
				return data.map((item) => ({
					day: item[0],
					hour: item[1],
					commits: item[2],
					dayName: dayNames[item[0]],
				}));
			}
		}
	} catch (error) {
		console.error('Failed to fetch punch card:', error);
	}
	return [];
}

async function fetchReleases(
	requestInit: RequestInit
): Promise<ProcessedRelease[]> {
	try {
		const response = await fetch(
			'https://api.github.com/repos/databuddy-analytics/Databuddy/releases?per_page=20',
			requestInit
		);

		if (response.ok) {
			const data: GitHubRelease[] = await response.json();
			if (Array.isArray(data)) {
				return data
					.filter((release) => !release.draft) // Filter out draft releases
					.map((release) => ({
						name: release.name || release.tag_name,
						tagName: release.tag_name,
						publishedAt: release.published_at,
						date: new Date(release.published_at),
						isPrerelease: release.prerelease,
					}))
					.slice(0, 10); // Latest 10 releases
			}
		}
	} catch (error) {
		console.error('Failed to fetch releases:', error);
	}
	return [];
}

async function fetchGitHubData() {
	const headers = {
		Accept: 'application/vnd.github.v3+json',
		'User-Agent': 'Databuddy-Docs',
	};

	const requestInit: RequestInit = {
		headers,
		next: { revalidate: 600 }, // 10 minutes
	};

	const statsRequestInit: RequestInit = {
		headers,
		next: { revalidate: 3600 }, // 1 hour for stats
	};

	try {
		// Fetch basic data
		const repo: GitHubRepo = await fetchBasicRepoData(requestInit);
		const contributors: GitHubContributor[] =
			await fetchContributorsData(requestInit);
		const languages: GitHubLanguages = await fetchLanguagesData(requestInit);
		const prs: GitHubPullRequest[] = await fetchPullRequestsData(requestInit);

		// Fetch stats data
		const commitActivity = await fetchCommitActivity(statsRequestInit);
		const codeFrequency = await fetchCodeFrequency(statsRequestInit);
		const punchCard = await fetchPunchCard(statsRequestInit);
		const releases = await fetchReleases(requestInit);

		// Process the data
		const totalContributions = contributors.reduce(
			(sum, contributor) => sum + contributor.contributions,
			0
		);

		const processedContributors = contributors
			.filter((contributor) => contributor.type === 'User')
			.slice(0, 12) // Top 12 contributors
			.map((contributor, index) => ({
				...contributor,
				rank: index + 1,
				percentage: (
					(contributor.contributions / totalContributions) *
					100
				).toFixed(1),
			}));

		const totalLanguageBytes = Object.values(languages).reduce(
			(sum, bytes) => sum + bytes,
			0
		);

		const processedLanguages = Object.entries(languages)
			.map(([name, bytes]) => ({
				name,
				bytes,
				percentage: ((bytes / totalLanguageBytes) * 100).toFixed(1),
			}))
			.sort((a, b) => b.bytes - a.bytes)
			.slice(0, 6);

		const openPRs = prs.filter((pr) => pr.state === 'open').length;
		const mergedPRs = prs.filter((pr) => pr.merged_at !== null).length;
		const closedPRs = prs.filter(
			(pr) => pr.state === 'closed' && pr.merged_at === null
		).length;

		return {
			repo,
			contributors: processedContributors,
			languages: processedLanguages,
			commitActivity,
			codeFrequency,
			punchCard,
			releases,
			stats: {
				totalContributors: contributors.length,
				totalContributions,
				openPRs,
				mergedPRs,
				closedPRs,
			},
		};
	} catch (error) {
		console.error('Failed to fetch GitHub data:', error);
		// Return default data if API fails
		return {
			repo: {
				stargazers_count: 0,
				forks_count: 0,
				open_issues_count: 0,
				watchers_count: 0,
				language: 'TypeScript',
			},
			contributors: [],
			languages: [],
			commitActivity: [],
			codeFrequency: [],
			punchCard: [],
			releases: [],
			stats: {
				totalContributors: 0,
				totalContributions: 0,
				openPRs: 0,
				mergedPRs: 0,
				closedPRs: 0,
			},
		};
	}
}

export default async function ContributorsPage() {
	const data = await fetchGitHubData();

	return (
		<div className="overflow-hidden">
			<Spotlight transform="translateX(-60%) translateY(-50%)" />

			{/* Hero Section */}
			<Section
				className="overflow-hidden"
				customPaddings
				id="contributors-hero"
			>
				<ContributorsHero
					contributors={data.stats.totalContributors}
					forks={data.repo.forks_count}
					issues={data.repo.open_issues_count}
					stars={data.repo.stargazers_count}
				/>
			</Section>

			{/* Contributors Grid Section */}
			<Section
				className="border-border border-t border-b bg-background/50"
				id="contributors-grid"
			>
				<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
					<ContributorsGrid contributors={data.contributors} />
				</div>
			</Section>

			{/* Commit Activity Section */}
			<Section
				className="border-border border-b bg-background/30"
				id="commit-activity"
			>
				<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
					<CommitActivityChart data={data.commitActivity} />
				</div>
			</Section>

			{/* Activity Stats Section */}
			<Section className="bg-background/50" id="activity-stats">
				<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
					<ActivityStats languages={data.languages} stats={data.stats} />
				</div>
			</Section>

			{/* Code Churn Section */}
			<Section
				className="border-border border-b bg-background/30"
				id="code-churn"
			>
				<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
					<CodeChurnChart data={data.codeFrequency} />
				</div>
			</Section>

			{/* Contribution Hours Heatmap Section */}
			<Section className="bg-background/50" id="punch-card">
				<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
					<PunchCardHeatmap data={data.punchCard} />
				</div>
			</Section>

			{/* Releases Timeline Section */}
			<Section
				className="border-border border-b bg-background/30"
				id="releases"
			>
				<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
					<ReleasesTimeline data={data.releases} />
				</div>
			</Section>

			{/* Gradient Divider */}
			<div className="w-full">
				<div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-border/30 to-transparent" />
			</div>

			{/* Footer Section */}
			<Footer />

			{/* Final Gradient Divider */}
			<div className="w-full">
				<div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-border/30 to-transparent" />
			</div>
		</div>
	);
}
