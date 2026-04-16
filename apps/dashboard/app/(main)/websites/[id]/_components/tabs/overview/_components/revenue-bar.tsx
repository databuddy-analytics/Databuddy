export const RevenueBar = (props: {
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	fill?: string;
	index?: number;
	hoveredIndex?: number | null;
	barSize?: number;
	payload?: { revenue?: number; refunds?: number };
}) => {
	const {
		x = 0,
		y = 0,
		width = 0,
		height = 0,
		fill,
		index,
		hoveredIndex,
		barSize = 6,
		payload,
	} = props;

	const revenue = payload?.revenue ?? 0;
	const refunds = payload?.refunds ?? 0;

	const isHighlighted =
		index !== undefined && hoveredIndex !== null && index === hoveredIndex;
	const isHovering = hoveredIndex !== null;
	const barFill = fill;
	const barOpacity = isHovering && !isHighlighted ? 0.3 : 1;
	const radius = Math.max(1, Math.min(4, Math.floor(barSize / 3)));

	// Calculate additional height for refunds (proportional to revenue height)
	// If revenue = 100 gives height H, then refunds = 10 should add H * (10/100) = H * 0.1
	const refundHeight = revenue > 0 ? (refunds / revenue) * height : 0;
	const hasRefunds = refundHeight >= 1;

	// If no refunds, render simple solid bar with rounded top
	if (!hasRefunds) {
		const path = `
            M${x + radius},${y}
            L${x + width - radius},${y}
            Q${x + width},${y} ${x + width},${y + radius}
            L${x + width},${y + height}
            L${x},${y + height}
            L${x},${y + radius}
            Q${x},${y} ${x + radius},${y}
            Z
        `;
		return (
			<g style={{ opacity: barOpacity, transition: "opacity 150ms ease-out" }}>
				<path
					d={path}
					fill={barFill}
					filter={isHighlighted ? "url(#bar-glow)" : undefined}
				/>
			</g>
		);
	}

	// Bar with refunds portion added on top
	const refundY = y - refundHeight; // Refund portion extends upward
	const strokeW = 1.5;
	const halfStroke = strokeW / 2;

	// Solid revenue bar (no rounded top since refund connects above)
	const solidPath = `
        M${x},${y}
        L${x + width},${y}
        L${x + width},${y + height}
        L${x},${y + height}
        Z
    `;

	// Hollow refund portion on top (with rounded top corners)
	const hollowFillPath = `
        M${x + radius},${refundY}
        L${x + width - radius},${refundY}
        Q${x + width},${refundY} ${x + width},${refundY + radius}
        L${x + width},${y}
        L${x},${y}
        L${x},${refundY + radius}
        Q${x},${refundY} ${x + radius},${refundY}
        Z
    `;

	// Dashed border path for refund portion - top and sides only
	const dashedBorderPath = `
        M${x + halfStroke},${y}
        L${x + halfStroke},${refundY + radius}
        Q${x + halfStroke},${refundY + halfStroke} ${x + radius},${refundY + halfStroke}
        L${x + width - radius},${refundY + halfStroke}
        Q${x + width - halfStroke},${refundY + halfStroke} ${x + width - halfStroke},${refundY + radius}
        L${x + width - halfStroke},${y}
    `;

	return (
		<g style={{ opacity: barOpacity, transition: "opacity 150ms ease-out" }}>
			{/* Solid revenue portion */}
			<path
				d={solidPath}
				fill={barFill}
				filter={isHighlighted ? "url(#bar-glow)" : undefined}
			/>
			{/* Hollow refund portion on top - accent color background */}
			<path
				d={hollowFillPath}
				fill="var(--accent)"
				filter={isHighlighted ? "url(#bar-glow)" : undefined}
			/>
			{/* Dashed border for refund portion */}
			<path
				d={dashedBorderPath}
				fill="none"
				stroke={barFill}
				strokeDasharray="3 2"
				strokeOpacity={0.5}
				strokeWidth={strokeW}
			/>
		</g>
	);
};
