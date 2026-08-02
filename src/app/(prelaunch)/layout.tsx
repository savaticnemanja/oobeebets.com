import { PrelaunchChrome } from "@/components/prelaunch-chrome";

export default function PrelaunchLayout({ children }: { children: React.ReactNode }) {
  return <PrelaunchChrome>{children}</PrelaunchChrome>;
}
