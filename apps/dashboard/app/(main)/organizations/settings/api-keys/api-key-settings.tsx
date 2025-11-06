"use client";

import { useState } from "react";
import { ApiKeyCreateDialog } from "@/components/organizations/api-key-create-dialog";
import { ApiKeyDetailDialog } from "@/components/organizations/api-key-detail-dialog";
import { ApiKeyList } from "@/components/organizations/api-key-list";

import type { Organization } from "@/hooks/use-organizations";

interface ApiKeySettingsProps {
	organization: Organization;
}

export function ApiKeySettings({ organization }: ApiKeySettingsProps) {
	// API Key dialog state
	const [showCreateApiKeyDialog, setShowCreateApiKeyDialog] = useState(false);
	const [showApiKeyDetailDialog, setShowApiKeyDetailDialog] = useState(false);
	const [apiKeyId, setApiKeyId] = useState<string | null>(null);

	// API Key handlers
	const handleCreateApiKey = () => {
		setShowCreateApiKeyDialog(true);
	};

	const handleSelectApiKey = (id: string) => {
		setApiKeyId(id);
		setShowApiKeyDetailDialog(true);
	};

	return (
		<div className="h-full p-6">
			<ApiKeyList
				onCreateNew={handleCreateApiKey}
				onSelect={handleSelectApiKey}
				organizationId={organization.id}
			/>

			{/* API Key Dialogs */}
			<ApiKeyCreateDialog
				onOpenChange={setShowCreateApiKeyDialog}
				open={showCreateApiKeyDialog}
				organizationId={organization.id}
			/>
			<ApiKeyDetailDialog
				keyId={apiKeyId}
				onOpenChange={setShowApiKeyDetailDialog}
				open={showApiKeyDetailDialog}
			/>
		</div>
	);
}
