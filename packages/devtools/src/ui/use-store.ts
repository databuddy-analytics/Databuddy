import { useEffect, useState } from "preact/hooks";
import { store } from "./store";

type State = ReturnType<typeof store.getState>;

export function useStoreState(): State {
	const [snap, setSnap] = useState<State>(store.getState());
	useEffect(() => store.subscribe(() => setSnap(store.getState())), []);
	return snap;
}
