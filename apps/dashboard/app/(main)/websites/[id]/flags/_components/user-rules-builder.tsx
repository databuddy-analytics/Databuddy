'use client';

import { FlagIcon, PlusIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { TagsChat } from '@/components/ui/tags';
import type { UserRule } from './types';

interface UserRulesBuilderProps {
	rules: UserRule[];
	onChange: (rules: UserRule[]) => void;
}

export function UserRulesBuilder({ rules, onChange }: UserRulesBuilderProps) {
	const addRule = () => {
		const newRule: UserRule = {
			type: 'user_id',
			operator: 'equals',
			value: '',
			enabled: true,
			batch: false,
		};
		onChange([...rules, newRule]);
	};

	const canUseBatch = (rule: UserRule) => {
		return rule.operator !== 'exists' && rule.operator !== 'not_exists';
	};

	const updateRule = (index: number, updatedRule: Partial<UserRule>) => {
		const newRules = [...rules];
		newRules[index] = { ...newRules[index], ...updatedRule };
		onChange(newRules);
	};

	const getPlaceholderText = (ruleType: UserRule['type']) => {
		switch (ruleType) {
			case 'user_id':
				return 'Type user ID and press Enter...';
			case 'email':
				return 'Type email address and press Enter...';
			case 'property':
				return 'Type property value and press Enter...';
			default:
				return 'Type value and press Enter...';
		}
	};

	const getInputPlaceholder = (ruleType: UserRule['type']) => {
		switch (ruleType) {
			case 'user_id':
				return 'Enter user ID';
			case 'email':
				return 'Enter email address';
			case 'property':
				return 'Enter property value';
			default:
				return 'Enter value';
		}
	};

	const removeRule = (index: number) => {
		onChange(rules.filter((_, i) => i !== index));
	};

	if (rules.length === 0) {
		return (
			<div className="rounded border border-primary/30 border-dashed bg-primary/5 p-8 text-center">
				<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
					<FlagIcon className="h-6 w-6 text-primary" weight="duotone" />
				</div>
				<h3 className="mb-2 font-medium text-sm">No targeting rules</h3>
				<p className="mb-4 text-muted-foreground text-xs">
					Add rules to target specific users, emails, or properties
				</p>
				<Button
					className="rounded"
					onClick={addRule}
					size="sm"
					type="button"
					variant="outline"
				>
					<PlusIcon className="mr-2 h-4 w-4" size={16} />
					Add First Rule
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{rules.map((rule, index) => {
				const ruleId = `rule-${index}`;
				const supportsBatch = canUseBatch(rule);

				return (
					<div className="rounded border bg-card p-4" key={index}>
						{/* Rule Header */}
						<div className="mb-4 flex items-center justify-between">
							<div className="flex items-center gap-2">
								<div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 font-medium text-primary text-xs">
									{index + 1}
								</div>
								<span className="font-medium text-sm">
									{rule.type === 'user_id' && 'User ID'}
									{rule.type === 'email' && 'Email'}
									{rule.type === 'property' && 'Property'}
									{rule.batch && ' (Batch)'}
								</span>
							</div>
							<Button
								aria-label={`Remove rule ${index + 1}`}
								onClick={() => removeRule(index)}
								size="sm"
								type="button"
								variant="ghost"
							>
								Remove
							</Button>
						</div>

						{/* Rule Configuration */}
						<div className="space-y-4">
							{/* Target Type & Batch Toggle */}
							<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
								<div>
									<label
										className="mb-1 block font-medium text-sm"
										htmlFor={`${ruleId}-type`}
									>
										Target Type
									</label>
									<Select
										onValueChange={(value: UserRule['type']) => {
											updateRule(index, {
												type: value,
												batch: rule.batch,
												operator: rule.operator,
											});
										}}
										value={rule.type}
									>
										<SelectTrigger id={`${ruleId}-type`}>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="user_id">User ID</SelectItem>
											<SelectItem value="email">Email</SelectItem>
											<SelectItem value="property">Property</SelectItem>
										</SelectContent>
									</Select>
								</div>

								{supportsBatch && (
									<div>
										<label
											className="mb-1 block font-medium text-sm"
											htmlFor={`${ruleId}-batch-toggle`}
										>
											Mode
										</label>
										<div className="flex items-center gap-2 rounded border p-2">
											<Switch
												checked={rule.batch}
												id={`${ruleId}-batch-toggle`}
												onCheckedChange={(batch) =>
													updateRule(index, { batch })
												}
											/>
											<span className="font-medium text-sm">
												{rule.batch ? 'Batch Mode' : 'Single Value'}
											</span>
										</div>
									</div>
								)}
							</div>

							{/* Property Field */}
							{rule.type === 'property' && (
								<div>
									<label
										className="mb-1 block font-medium text-sm"
										htmlFor={`${ruleId}-field`}
									>
										Property Name
									</label>
									<Input
										id={`${ruleId}-field`}
										onChange={(e) =>
											updateRule(index, { field: e.target.value })
										}
										placeholder="e.g. plan, role, country"
										value={rule.field || ''}
									/>
								</div>
							)}

							{/* Condition & Value */}
							{rule.batch ? (
								<div>
									<div className="mb-1 block font-medium text-sm">
										{rule.type === 'user_id' && 'User IDs'}
										{rule.type === 'email' && 'Email Addresses'}
										{rule.type === 'property' && 'Property Values'}
									</div>
									<TagsChat
										allowDuplicates={false}
										maxTags={100}
										onChange={(values: string[]) =>
											updateRule(index, { batchValues: values })
										}
										placeholder={getPlaceholderText(rule.type)}
										values={rule.batchValues || []}
									/>
								</div>
							) : (
								<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
									<div>
										<label
											className="mb-1 block font-medium text-sm"
											htmlFor={`${ruleId}-operator`}
										>
											Condition
										</label>
										<Select
											onValueChange={(value: UserRule['operator']) =>
												updateRule(index, { operator: value })
											}
											value={rule.operator}
										>
											<SelectTrigger id={`${ruleId}-operator`}>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="equals">Equals</SelectItem>
												<SelectItem value="contains">Contains</SelectItem>
												<SelectItem value="starts_with">Starts with</SelectItem>
												<SelectItem value="ends_with">Ends with</SelectItem>
												<SelectItem value="in">Is one of</SelectItem>
												<SelectItem value="not_in">Is not one of</SelectItem>
												{rule.type === 'property' && (
													<>
														<SelectItem value="exists">Exists</SelectItem>
														<SelectItem value="not_exists">
															Does not exist
														</SelectItem>
													</>
												)}
											</SelectContent>
										</Select>
									</div>

									{rule.operator !== 'exists' &&
										rule.operator !== 'not_exists' && (
											<div>
												<label
													className="mb-1 block font-medium text-sm"
													htmlFor={`${ruleId}-value`}
												>
													{rule.operator === 'in' || rule.operator === 'not_in'
														? 'Values'
														: 'Value'}
												</label>
												{rule.operator === 'in' ||
												rule.operator === 'not_in' ? (
													<TagsChat
														allowDuplicates={false}
														maxTags={20}
														onChange={(values: string[]) =>
															updateRule(index, { values })
														}
														placeholder={getPlaceholderText(rule.type)}
														values={rule.values || []}
													/>
												) : (
													<Input
														id={`${ruleId}-value`}
														onChange={(e) =>
															updateRule(index, { value: e.target.value })
														}
														placeholder={getInputPlaceholder(rule.type)}
														value={rule.value || ''}
													/>
												)}
											</div>
										)}
								</div>
							)}

							{/* Result */}
							<div className="flex items-center justify-between rounded bg-muted/30 p-3">
								<span className="font-medium text-sm">
									When this rule matches:
								</span>
								<div className="flex items-center gap-2">
									<span
										className={
											rule.enabled ? 'text-muted-foreground' : 'font-medium'
										}
									>
										Disabled
									</span>
									<Switch
										checked={rule.enabled}
										onCheckedChange={(enabled) =>
											updateRule(index, { enabled })
										}
									/>
									<span
										className={
											rule.enabled ? 'font-medium' : 'text-muted-foreground'
										}
									>
										Enabled
									</span>
								</div>
							</div>
						</div>
					</div>
				);
			})}

			<Button
				className="w-full"
				onClick={addRule}
				type="button"
				variant="outline"
			>
				<PlusIcon className="mr-2 h-4 w-4" size={16} />
				Add Rule
			</Button>
		</div>
	);
}
