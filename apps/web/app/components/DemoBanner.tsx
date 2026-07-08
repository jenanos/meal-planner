import { isDemoMode } from "../../lib/demo";

const REPO_URL = "https://github.com/jenanos/meal-planner";

export function DemoBanner() {
  if (!isDemoMode) return null;

  return (
    <div className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-center text-xs text-amber-900">
      <span className="font-semibold">Demo</span> – åpne testdata som
      tilbakestilles automatisk. Prøv gjerne alt!{" "}
      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline underline-offset-2"
      >
        Se kildekoden på GitHub
      </a>
    </div>
  );
}
