"use client";

import * as React from "react";

export interface Viewer {
  id: string;
  name: string;
  username: string;
}

const ViewerContext = React.createContext<Viewer | null>(null);

/**
 * Who is signed in, for client components deep in a page that need it — a
 * post's Reply and Quote open a composer that shows your avatar. Provided by
 * AppShell; null outside it (signed out).
 */
export function ViewerProvider({ viewer, children }: { viewer: Viewer; children: React.ReactNode }) {
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer | null {
  return React.useContext(ViewerContext);
}
