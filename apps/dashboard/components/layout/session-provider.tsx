"use client";

import type { Session } from "@databuddy/auth";
import { createContext, useContext } from "react";

interface SessionContextValue {
	session: Session | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionProvider = ({
	children,
	session,
}: {
	children: React.ReactNode;
	session: Session | null;
}) => (
	<SessionContext.Provider value={{ session }}>
		{children}
	</SessionContext.Provider>
);

export const useSession = () => {
	const context = useContext(SessionContext);

	if (!context) {
		throw new Error("useSession must be used within a SessionProvider");
	}

	return context;
};
