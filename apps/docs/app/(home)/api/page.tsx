import { Footer } from '@/components/footer';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { getQueryTypes } from './actions';
import { QueryDemo } from './query-demo';

export default async function ApiPlaygroundPage() {
	const queryTypesData = await getQueryTypes();

	return (
		<div className="px-4 pt-10 sm:px-6 lg:px-8">
			<div className="mx-auto w-full max-w-7xl">
				<div className="mb-8">
					<h1 className="font-semibold text-2xl">Databuddy Query API</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						Interactive API explorer - select query types and see real responses
					</p>
				</div>

				{/* Interactive Demo */}
				<Card className="mb-8 rounded">
					<QueryDemo />
				</Card>

				<Card className="rounded">
					<CardHeader>
						<CardTitle>API Documentation</CardTitle>
						<CardDescription>
							Endpoint details and authentication requirements
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-8">
						{/* Query Types */}
						<div className="space-y-6">
							<div>
								<h3 className="font-semibold text-lg">Available Query Types</h3>
								<p className="text-muted-foreground text-sm">
									Use these parameter names in your queries to get specific
									analytics data.
								</p>
							</div>

							{queryTypesData.success ? (
								queryTypesData.types.length === 0 ? (
									<div className="rounded border border-gray-200 bg-gray-50 p-6 text-center">
										<div className="space-y-2">
											<h4 className="font-medium text-gray-800">
												No Query Types Found
											</h4>
											<p className="text-gray-600 text-sm">
												No query types are currently available.
											</p>
										</div>
									</div>
								) : (
									<div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
										{queryTypesData.types.sort().map((type) => (
											<div className="rounded border p-4" key={type}>
												<div className="space-y-3">
													<div className="flex items-start justify-between">
														<code className="font-medium font-mono text-sm">
															{type}
														</code>
														{queryTypesData.configs[type]?.customizable && (
															<span className="rounded bg-blue-100 px-2 py-1 text-blue-800 text-xs">
																Customizable
															</span>
														)}
													</div>

													{queryTypesData.configs[type] && (
														<div className="space-y-2">
															{queryTypesData.configs[type].defaultLimit && (
																<div className="text-muted-foreground text-xs">
																	Default limit:{' '}
																	{queryTypesData.configs[type].defaultLimit}
																</div>
															)}

															{queryTypesData.configs[type].allowedFilters
																?.length > 0 && (
																<div className="text-muted-foreground text-xs">
																	<span className="font-medium">Filters:</span>{' '}
																	{queryTypesData.configs[
																		type
																	].allowedFilters.join(', ')}
																</div>
															)}
														</div>
													)}
												</div>
											</div>
										))}
									</div>
								)
							) : (
								<div className="rounded border border-red-200 bg-red-50 p-6 text-center">
									<div className="space-y-2">
										<h4 className="font-medium text-red-800">
											Query Types Unavailable
										</h4>
										<p className="text-red-600 text-sm">
											Could not fetch query types from the API. Please check
											your connection and try again.
										</p>
									</div>
								</div>
							)}
						</div>

						{/* Authentication */}
						<div className="space-y-4">
							<div>
								<h3 className="font-semibold text-lg">Authentication</h3>
								<p className="text-muted-foreground text-sm">
									Include your API key in the X-Api-Key header.
								</p>
							</div>

							<div className="rounded border bg-muted p-4">
								<code className="text-xs">X-Api-Key: YOUR_API_KEY</code>
							</div>
						</div>

						{/* Parameters */}
						<div className="space-y-4">
							<div>
								<h3 className="font-semibold text-lg">Required Parameters</h3>
								<p className="text-muted-foreground text-sm">
									Include these query parameters with every request.
								</p>
							</div>

							<div className="grid gap-4 md:grid-cols-3">
								<div className="rounded border p-4">
									<div className="font-medium text-sm">website_id</div>
									<div className="text-muted-foreground text-xs">
										Your website identifier (e.g., web_abc123)
									</div>
								</div>
								<div className="rounded border p-4">
									<div className="font-medium text-sm">start_date</div>
									<div className="text-muted-foreground text-xs">
										Start date (YYYY-MM-DD format)
									</div>
								</div>
								<div className="rounded border p-4">
									<div className="font-medium text-sm">end_date</div>
									<div className="text-muted-foreground text-xs">
										End date (YYYY-MM-DD format)
									</div>
								</div>
							</div>
						</div>

						{/* Rate Limits */}
						<div className="space-y-4">
							<div>
								<h3 className="font-semibold text-lg">Rate Limits</h3>
								<p className="text-muted-foreground text-sm">
									API requests are limited to ensure fair usage across all
									users.
								</p>
							</div>

							<div className="grid gap-4 md:grid-cols-3">
								<div className="rounded border p-4 text-center">
									<div className="font-semibold text-2xl">1,000</div>
									<div className="text-muted-foreground text-sm">
										requests per hour
									</div>
								</div>
								<div className="rounded border p-4 text-center">
									<div className="font-semibold text-2xl">10,000</div>
									<div className="text-muted-foreground text-sm">
										requests per day
									</div>
								</div>
								<div className="rounded border p-4 text-center">
									<div className="font-semibold text-2xl">200,000</div>
									<div className="text-muted-foreground text-sm">
										requests per month
									</div>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				<div className="mt-10">
					<Footer />
				</div>
			</div>
		</div>
	);
}
