'use client';

import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useState } from 'react';

export interface JsonNodeProps {
	data: unknown;
	name?: string;
	level?: number;
}

function getValueColor(value: unknown) {
	if (value === null) {
		return 'text-muted-foreground';
	}
	if (typeof value === 'string') {
		return 'text-emerald-500 dark:text-emerald-300';
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return 'text-amber-500 dark:text-amber-300';
	}
	return 'text-foreground/90';
}

function formatValue(value: unknown) {
	if (value === null) {
		return 'null';
	}
	if (typeof value === 'string') {
		return `"${value}"`;
	}
	return String(value);
}

function PrimitiveNode({
	value,
	name,
	level,
}: {
	value: unknown;
	name?: string;
	level: number;
}) {
	const indent = level * 12;
	return (
		<div
			className="flex items-center rounded px-2 py-1 transition-colors hover:bg-muted/20"
			style={{ paddingLeft: indent }}
		>
			{name && <span className="mr-2 text-primary">{name}:</span>}
			<span className={getValueColor(value)}>{formatValue(value)}</span>
		</div>
	);
}

function ArrayNode({
	data,
	name,
	level,
}: {
	data: unknown[];
	name?: string;
	level: number;
}) {
	const [isExpanded, setIsExpanded] = useState(true);
	const indent = level * 12;
	if (data.length === 0) {
		return <PrimitiveNode level={level} name={name} value="[]" />;
	}
	return (
		<div>
			<button
				aria-expanded={isExpanded}
				className="flex w-full items-center rounded px-2 py-1 text-left transition-colors hover:bg-muted/20"
				onClick={() => setIsExpanded(!isExpanded)}
				style={{ paddingLeft: indent }}
				type="button"
			>
				{isExpanded ? (
					<CaretDownIcon className="mr-1 h-4 w-4 text-muted-foreground" />
				) : (
					<CaretRightIcon className="mr-1 h-4 w-4 text-muted-foreground" />
				)}
				{name && <span className="mr-2 text-primary">{name}:</span>}
				<span className="font-semibold text-foreground/80">[</span>
			</button>
			{isExpanded && (
				<>
					{data.map((item, index) => (
						<JsonNode
							data={item}
							key={`${name || 'root'}-${index}`}
							level={level + 1}
						/>
					))}
					<div
						className="flex items-center py-1"
						style={{ paddingLeft: indent }}
					>
						<span className="font-semibold text-foreground/80">]</span>
					</div>
				</>
			)}
			{!isExpanded && (
				<div className="flex items-center py-1" style={{ paddingLeft: indent }}>
					<span className="font-semibold text-foreground/80">]</span>
				</div>
			)}
		</div>
	);
}

function ObjectNode({
	data,
	name,
	level,
}: {
	data: Record<string, unknown>;
	name?: string;
	level: number;
}) {
	const [isExpanded, setIsExpanded] = useState(true);
	const indent = level * 12;
	const keys = Object.keys(data);
	if (keys.length === 0) {
		return <PrimitiveNode level={level} name={name} value="{}" />;
	}
	return (
		<div>
			<button
				aria-expanded={isExpanded}
				className="flex w-full items-center rounded px-2 py-1 text-left transition-colors hover:bg-muted/20"
				onClick={() => setIsExpanded(!isExpanded)}
				style={{ paddingLeft: indent }}
				type="button"
			>
				{isExpanded ? (
					<CaretDownIcon className="mr-1 h-4 w-4 text-muted-foreground" />
				) : (
					<CaretRightIcon className="mr-1 h-4 w-4 text-muted-foreground" />
				)}
				{name && <span className="mr-2 text-primary">{name}:</span>}
				<span className="font-semibold text-foreground/80">{'{'}</span>
			</button>
			{isExpanded && (
				<>
					{keys.map((key) => (
						<JsonNode data={data[key]} key={key} level={level + 1} name={key} />
					))}
					<div
						className="flex items-center py-1"
						style={{ paddingLeft: indent }}
					>
						<span className="font-semibold text-foreground/80">{'}'}</span>
					</div>
				</>
			)}
			{!isExpanded && (
				<div className="flex items-center py-1" style={{ paddingLeft: indent }}>
					<span className="font-semibold text-foreground/80">{'}'}</span>
				</div>
			)}
		</div>
	);
}

export function JsonNode({ data, name, level = 0 }: JsonNodeProps) {
	if (
		data === null ||
		typeof data === 'string' ||
		typeof data === 'number' ||
		typeof data === 'boolean'
	) {
		return <PrimitiveNode level={level} name={name} value={data} />;
	}
	if (Array.isArray(data)) {
		return <ArrayNode data={data} level={level} name={name} />;
	}
	if (typeof data === 'object') {
		return (
			<ObjectNode
				data={data as Record<string, unknown>}
				level={level}
				name={name}
			/>
		);
	}
	return null;
}
