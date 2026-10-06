"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setUserFollowAction } from "@/app/actions/social";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Follow / Following, as on X: once following, hovering turns the button
 * red and says Unfollow, so the destructive click is never a surprise.
 * Optimistic for the same reason the pick circle is — see FollowToggle.
 */
export function FollowButton({
  userId,
  username,
  following,
  signedIn,
  size = "sm",
  className,
}: {
  userId: string;
  username: string;
  following: boolean;
  signedIn: boolean;
  size?: "sm" | "default";
  className?: string;
}) {
  const [state, setState] = useOptimistic(following);
  const [, startTransition] = useTransition();
  const [hover, setHover] = useState(false);
  const router = useRouter();

  function toggle() {
    if (!signedIn) {
      router.push(`/login?next=/u/${username}`);
      return;
    }
    const next = !state;
    startTransition(async () => {
      setState(next);
      const result = await setUserFollowAction(userId, next);
      if (result && !result.ok) toast.error(result.error);
    });
  }

  return (
    <Button
      type="button"
      size={size}
      variant={state ? "outline" : "default"}
      onClick={toggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-pressed={state}
      aria-label={`${state ? "Unfollow" : "Follow"} @${username}`}
      className={cn(
        "relative z-10 min-w-[6.5rem] rounded-full",
        state && hover && "border-miss/50 bg-miss-dim text-miss hover:border-miss/50",
        className,
      )}
    >
      {state ? (hover ? "Unfollow" : "Following") : "Follow"}
    </Button>
  );
}
