"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "@/components/ui/toaster";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/*
 * Live notices for editors (items 16, 22): new submissions, revisions,
 * reviews and contact messages appear as they happen, over Supabase
 * Realtime. The database's RLS decides which events each person receives.
 */

interface DomainEvent {
  event_type: string;
  aggregate_id: string;
}

const NOTICES: Record<string, { text: string; href: (id: string) => string }> = {
  "submission.created": { text: "New manuscript submitted", href: (id) => `/admin/submissions/${id}` },
  "submission.revised": { text: "Revised manuscript uploaded", href: (id) => `/admin/submissions/${id}` },
  "review.submitted": {
    text: "A reviewer submitted a review",
    href: () => "/admin/submissions?status=under_review",
  },
  "contact.received": { text: "New message from the contact form", href: (id) => `/admin/messages/${id}` },
};

export function LiveNotices() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      // Realtime needs the user's token so RLS can check each event.
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session) return;
      await supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel("staff-notices")
        .on<DomainEvent>(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "domain_events" },
          ({ new: event }) => {
            const notice = NOTICES[event.event_type];
            if (!notice) return;
            toast.info(notice.text, {
              action: { label: "Open", onClick: () => router.push(notice.href(event.aggregate_id)) },
              duration: 10_000,
            });
            // No automatic refresh: it could land in the middle of someone's edit.
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
