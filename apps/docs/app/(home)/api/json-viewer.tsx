'use client';

import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';

export interface JsonNodeProps {
	data: unknown;
	name?: string;
	level?: number;
	maxDepth?: number;
}

const MAX_DEPTH = 20;

const indentClasses = [
	'pl-0',
	'pl-3',
	'pl-6',
	'pl-9',
	'pl-12',
	'pl-[60px]',
	'pl-[72px]',
	'pl-[84px]',
	'pl-[96px]',
	'pl-[108px]',
	'pl-[120px]',
	'pl-[132px]',
	'pl-[144px]',
	'pl-[156px]',
	'pl-[168px]',
	'pl-[180px]',
	'pl-[192px]',
	'pl-[204px]',
	'pl-[216px]',
	'pl-[228px]',
	'pl-[240px]',
];

function getKeyColor() {
	return 'text-green-600 dark:text-blue-300';
}

function getValueColor(value: unknown) {
	if (value === null) {
		return 'text-muted-foreground';
	}
	if (typeof value === 'string') {
		return 'text-blue-600 dark:text-orange-300';
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return 'text-blue-600 dark:text-orange-300';
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
	const indentClass = indentClasses[Math.min(level, indentClasses.length - 1)];
	return (
		<div
			className={`flex items-center rounded px-2 py-1 font-mono transition-colors hover:bg-muted/20 ${indentClass}`}
		>
			{name && <span className={`mr-2 ${getKeyColor()}`}>{name}:</span>}
			<span className={getValueColor(value)}>{formatValue(value)}</span>
		</div>
	);
}

function ArrayNode({
	data,
	name,
	level,
	maxDepth = MAX_DEPTH,
}: {
	data: unknown[];
	name?: string;
	level: number;
	maxDepth?: number;
}) {
	const [isExpanded, setIsExpanded] = useState(true);
	const indentClass = indentClasses[Math.min(level, indentClasses.length - 1)];

	const itemKeys = useMemo(
		() => data.map((_, index) => `${name || 'root'}_${level}_${index}`),
		[data, name, level]
	);

	if (data.length === 0) {
		return <PrimitiveNode level={level} name={name} value="[]" />;
	}

	if (level >= maxDepth) {
		return (
			<PrimitiveNode level={level} name={name} value="[...deeply nested]" />
		);
	}

	return (
		<div className="font-mono">
			<button
				aria-expanded={isExpanded}
				className={`flex w-full items-center rounded px-2 py-1 text-left transition-colors hover:bg-muted/20 ${indentClass}`}
				onClick={() => setIsExpanded(!isExpanded)}
				type="button"
			>
				{isExpanded ? (
					<CaretDownIcon className="mr-1 h-4 w-4 text-muted-foreground" />
				) : (
					<CaretRightIcon className="mr-1 h-4 w-4 text-muted-foreground" />
				)}
				{name && <span className={`mr-2 ${getKeyColor()}`}>{name}:</span>}
				<span className="font-semibold text-foreground/80">[</span>
			</button>
			{isExpanded && (
				<>
					{data.map((item, index) => (
						<JsonNode
							data={item}
							key={itemKeys[index]}
							level={level + 1}
							maxDepth={maxDepth}
						/>
					))}
					<div className={`flex items-center py-1 ${indentClass}`}>
						<span className="font-semibold text-foreground/80">]</span>
					</div>
				</>
			)}
			{!isExpanded && (
				<div className={`flex items-center py-1 ${indentClass}`}>
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
	maxDepth = MAX_DEPTH,
}: {
	data: Record<string, unknown>;
	name?: string;
	level: number;
	maxDepth?: number;
}) {
	const [isExpanded, setIsExpanded] = useState(true);
	const indentClass = indentClasses[Math.min(level, indentClasses.length - 1)];
	const keys = Object.keys(data);

	const keyProps = useMemo(
		() =>
			keys.map((key) => ({
				key: `${name || 'root'}_${level}_${key}`,
				name: key,
			})),
		[keys, name, level]
	);

	if (keys.length === 0) {
		return <PrimitiveNode level={level} name={name} value="{}" />;
	}

	if (level >= maxDepth) {
		return (
			<PrimitiveNode level={level} name={name} value="{...deeply nested}" />
		);
	}

	return (
		<div className="font-mono">
			<button
				aria-expanded={isExpanded}
				className={`flex w-full items-center rounded px-2 py-1 text-left transition-colors hover:bg-muted/20 ${indentClass}`}
				onClick={() => setIsExpanded(!isExpanded)}
				type="button"
			>
				{isExpanded ? (
					<CaretDownIcon className="mr-1 h-4 w-4 text-muted-foreground" />
				) : (
					<CaretRightIcon className="mr-1 h-4 w-4 text-muted-foreground" />
				)}
				{name && <span className={`mr-2 ${getKeyColor()}`}>{name}:</span>}
				<span className="font-semibold text-foreground/80">{'{'}</span>
			</button>
			{isExpanded && (
				<>
					{keyProps.map(({ key, name: keyName }) => (
						<JsonNode
							data={data[keyName]}
							key={key}
							level={level + 1}
							maxDepth={maxDepth}
							name={keyName}
						/>
					))}
					<div className={`flex items-center py-1 ${indentClass}`}>
						<span className="font-semibold text-foreground/80">{'}'}</span>
					</div>
				</>
			)}
			{!isExpanded && (
				<div className={`flex items-center py-1 ${indentClass}`}>
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
