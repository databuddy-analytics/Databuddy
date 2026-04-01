"use client";

import { LockIcon } from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PasswordGateProps {
	slug: string;
	title: string;
	orgName: string;
}

export function PasswordGate({ slug, title, orgName }: PasswordGateProps) {
	const [password, setPassword] = useState("");
	const [error, setError] = useState(false);
	const router = useRouter();
	const searchParams = useSearchParams();

	const handleSubmitAction = (e: React.FormEvent) => {
		e.preventDefault();
		if (!password.trim()) {
			return;
		}

		const params = new URLSearchParams(searchParams.toString());
		params.set("password", password);
		router.push(`/status/${slug}?${params.toString()}`);
	};

	return (
		<div className="flex flex-col items-center justify-center py-16">
			<div className="flex size-12 items-center justify-center rounded-full bg-muted">
				<LockIcon className="size-6 text-muted-foreground" weight="duotone" />
			</div>

			<h1 className="mt-4 text-balance text-center font-semibold text-lg">
				{title || orgName}
			</h1>
			<p className="mt-1 text-pretty text-center text-muted-foreground text-sm">
				This status page is password protected
			</p>

			<form
				className="mt-6 flex w-full max-w-xs flex-col gap-3"
				onSubmit={handleSubmitAction}
			>
				<Input
					autoFocus
					onChange={(e) => {
						setPassword(e.target.value);
						setError(false);
					}}
					placeholder="Enter password"
					type="password"
					value={password}
				/>
				{error ? (
					<p className="text-destructive text-xs">Incorrect password</p>
				) : null}
				<Button disabled={!password.trim()} type="submit">
					View Status Page
				</Button>
			</form>
		</div>
	);
}
