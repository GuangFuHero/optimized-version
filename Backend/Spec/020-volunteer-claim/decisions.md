# Decisions: 020 Volunteer Claim

Part of the site revamp: a volunteer claims one need of a request, not the whole request, and a
request's owner can stop recruiting for one need. Numbering continues the repo-wide ADR sequence: this
spec holds ADR-291 to ADR-293 and ADR-456 (`Spec/019-role-requests` holds ADR-287 to ADR-290 and ADR-294).

The rules below were set by the team on 2026-09-28 and by the product owner between 2026-09-26 and
2026-09-30.

Terms: a **request** is a `tickets` row; a **need** is one of its `ticket_tasks` rows, with an optional
`quantity` of people; a **claim** is a `task_assignments` row linking a person to a need. The site says
求助 for a request and 需求 for a need.

---

### ADR-291 A need takes people up to its quantity, from anyone, and the claim that fills it fulfils it

> **Status: ACCEPTED (2026-10-01).** Rules decided by the team on 2026-09-28. That the cap binds
> coordinators too was the product owner's call the same day, against a proposal to keep their
> over-assignment; the order of the checks was settled on 2026-09-30.

**In plain words**: a need that asks for 3 people takes 3, whether they sign up themselves or a coordinator
sends them. The third claim marks it fulfilled: it has everyone it asked for, and they still go. If one of
them gives the place back, the need recruits again.

**Context**: Before this ADR, a claim (`assign_task_actor`) checked nothing but duplicates. A need asking
for 3 people took a fourth and a fifth; a fulfilled or cancelled need, and any need of a closed request,
could still be claimed. HC's `d847624` (2026-06-08) let a coordinator assign people past the quantity on
purpose. "Fulfilled" was set by hand through `updateTicketTask`, so a full need read as open until someone
remembered to change it.

**Decision**:

1. **The quantity caps everyone.** Once a need has `quantity` people, `assign_task_actor` refuses with
   `Task is full`, a coordinator assigning someone else included. To send more people, add another need.
   This reverses `d847624`: `test_over_subscription_allowed` became `test_a_coordinator_cannot_over_subscribe`
   (`tests/test_graphql/test_mutations.py`), and
   `test_a_coordinator_may_still_send_more_than_the_need_asks_for` became
   `test_a_coordinator_cannot_send_more_than_the_need_asks_for` (`tests/test_volunteer_claim.py`). A need
   without a quantity has no cap: its owner never said how many.
2. **The claim that fills a need fulfils it**, in the same transaction, and sets `completed_at`. Fulfilled
   means "has everyone it asked for", not "done": nobody on it has gone yet. The site calls it 已滿足需求,
   not 已完成. A need without a quantity is never fulfilled by claims.
3. **Giving a place back reopens a need that filled by itself** (`unassign_task_actor`): it returns to
   `pending` and `completed_at` is cleared, with no notice. A need whose owner stopped recruiting is never
   reopened; it cannot be given back at all (ADR-292). A need over the quantity from before the cap can
   still be full after losing one person, and stays fulfilled.
4. **The checks run in this order** (`_lock_task_with_room`):
   - the need is cancelled → `Task is no longer open`
   - the person is already on it → `Actor already assigned to this task`
   - it has its quantity → `Task is full`
   - it is fulfilled with room left (only data from before this ADR), or its request is `completed` or
     `cancelled` → `Task is no longer open`

   The count comes before the request's status on purpose. A request's status follows its needs: when
   its last open need fills, the request becomes `completed` in the same commit
   (`app/services/ticket_status.py:recompute_ticket_status`). Checked first, the request's status would
   tell the next person the need is over (the site's 已結束) when it is only full (已滿).
5. **One transaction, one lock order.** A claim, a release and a stop each lock the need's request and
   then the need (`SELECT … FOR UPDATE`, `_lock_ticket_and_task`), count under the locks, write, flush,
   work the request's status out again (`recompute_ticket_status`), and commit once. The flush is explicit
   because sessions run with `autoflush=False` (`app/db/session.py`). Writers on one request queue instead
   of deadlocking, and two people racing for the last place cannot both get it. Authorization runs before
   the locks, so a caller who will be refused never takes them.
6. **Notices**, sent after the commit:
   - the request's owner hears who is coming (`task_claimed`, high), named after the person going even
     when a coordinator sent them, and not when the owner claimed their own need;
   - when a claim fills a need, everyone already on it hears it is complete (`task_full`, medium,
     titled `「{need}」已經湊齊人了`);
   - giving your own place back, and the reopening it may cause, send nothing;
   - someone removed by another person hears it (`task_assignment_removed`, high, titled
     `你已被移出「{need}」`), unless the need was deleted: `task_deleted` or `ticket_deleted` already
     told them not to come.
7. **Every need but a rescue says how many** (added 2026-10-08, after #61 review; the product owner's
   call). A need without a quantity never fills, so its request never completes on its own. `hr`,
   `supply` and `medical` needs are refused without one, and so is a kind the back office configured itself
   (ADR-214; the rule names the exception, `QUANTITY_OPTIONAL_TASK_TYPES`, since 2026-10-11): filing a help
   request, adding a need (the site's 「再加一件」 and the back office share `createTicketTask`), and a bulk
   import, whose preview fails the row before its ticket is written. A `rescue` need may leave it out —
   whoever is trapped does not know how many it takes, and the design leaves rescues out of the 缺額
   count — and then has no cap, as point 1 says. Needs filed before this keep their null quantity.

**Consequences**:
➕ "Full" and "fulfilled" are kept by the backend, not by someone remembering to set them.
➕ The site can tell a full need from a closed one, and show a volunteer the need they claimed even after it
fills (`TicketTaskType.myAssignment`).
➖ A coordinator cannot over-staff a need any more; the back office has to add another need.
➖ Needs over-staffed before the cap keep their extra people; the cap only stops new claims.
➖ How a request ends is derived, with no close action of its own (the product owner, 2026-10-08, after
#61 review asked how the back office closes one). It completes once none of its needs is open: each filled,
stopped (ADR-292) or deleted. Two cases need a hand: a rescue need, or one from before point 7, has no
quantity and never fills, so its owner or a coordinator stops recruiting once enough people are on it, or
deletes it if nobody is; and a request filed with no need at all (only the back office's `createTicket`
can) stays `pending` until a need is added or the request is deleted, which cancels it. Deleting needs
and requests takes `ticket.delete`: team admins hold it for their zone, members for their own only.

---

### ADR-292 A request's owner stops recruiting one need at a time, and that need's people are then final

> **Status: ACCEPTED (2026-10-01).** Stopping per need was decided by the team on 2026-09-28, replacing
> a whole-request stop built two days earlier. Refusing a need nobody claimed, the notice, and refusing
> to give places back afterwards were the product owner's calls on 2026-09-28 and 2026-09-29.

**In plain words**: when a need has enough people, its owner can stop recruiting for it ("3 of 5 is
enough"). The 3 stay on it and still go; nobody else can claim it; none of the 3 can give the place back.
It cannot be undone: to recruit again, add another need.

**Context**: The site prototype had a whole-request 「刪除媒合單」 that closed every need at once. It was
first built as `stopRecruiting(ticketUuid)`, which cancelled every open need of a request. On 2026-09-28 the
team ruled that stopping is per need, that cancelling means deleting (`deleteTicketTask` and
`deleteTicket`), and that a request's status follows its needs.

**Decision**:

1. **`stopRecruiting(taskUuid: UUID!)`** (`stop_recruiting`) needs `ticket.edit` on the need's request.
   On the site that is its owner, whose `user` grant is `own`. It is checked before the locks.
2. **What it does**, in one commit under ADR-291's lock order: the need becomes `fulfilled`; its `quantity`
   is cut to the number of people on it now (a need without a quantity gets that number too); `completed_at`
   and the new column `ticket_tasks.recruiting_stopped_at` (migration `6c5a9d3d3444`) are set; the request's
   status is worked out again.
3. **It is refused**:
   - when the need is no longer open (fulfilled, whether filled or stopped already; cancelled; or its
     request is `completed` or `cancelled`) → `Task is no longer open`;
   - when nobody is on it → `Nobody has claimed this task`: there is nobody to keep, so the owner deletes
     the need instead;
   - when the need or its request was deleted → `Ticket task not found`.
4. **Everyone on the need hears**, after the commit: `task_recruiting_stopped`, medium, titled
   `「{need}」已停止招募`, reading `{request}　建單者已停止招募，你仍在名單上，時間到請照常前往。`
5. **Nobody can give a place back on a stopped need**, whoever asks, coordinators included:
   `unassign_task_actor` refuses with `Recruiting has stopped for this task`. Those on it may already have
   done the work, or were enough, and the platform cannot tell which; a freed place would let the need
   refill after its owner closed it. A need that filled by itself (`recruiting_stopped_at` is null) can
   still be given back, and reopens (ADR-291).
6. **`TicketTaskType.recruitingStoppedAt`** is public, so the site can leave out 「釋出名額」 for a stopped
   need instead of letting the volunteer try and be refused.

**Consequences**:
➕ A request can finish with fewer people than it asked for, without deleting the need or misreporting it as
filled.
➖ Irreversible by design: a mistaken stop means adding a new need, and the people on the old one cannot
leave it; the only way out is deleting the need.
➖ `recruiting_stopped_at` is the only record that a need was stopped rather than filled. The back-office
statistics (`app/services/ticket_analytics.py`) count both as fulfilled; telling them apart means reading
this column.

---

### ADR-293 A need's status moves only through the actions that own it; a deleted need's claims stay put

> **Status: ACCEPTED (2026-10-01).** The first part was agreed by the team on 2026-09-28; the guard inside
> the service was the product owner's call on 2026-09-30. The second part was decided on 2026-09-30, after
> the gap turned up while checking that deleted rows stay hidden.

**In plain words**: nobody sets a need's status by hand any more. A need is fulfilled when it fills or is
stopped, reopens when a place frees, and is cancelled when it is deleted. Once a need is deleted, the claims
on it are kept unchanged, as the record of who was on it.

**Context**: `updateTicketTask` took a `status`, so a need could be set to anything, `in_progress` included,
each change sending its own notice (`_task_status_notice`). With ADR-291 and ADR-292 in place, such an edit
could reopen a need its owner stopped, or close one without telling anyone. Separately, deleting a need or a
request (`delete_ticket_task`, `delete_ticket`) keeps its claims as a record, but `updateTaskAssignment`
could still change their `status` and `role`.

**Decision**:

1. **A need's status is `pending`, `fulfilled` or `canceled`.** `in_progress` is gone for needs; a request
   keeps it. Only these change a need's status, each sending its own notice and keeping its own timestamps:
   a claim (filling it, ADR-291), giving a place back (reopening it, ADR-291), stopping recruitment
   (ADR-292), and deletion (`delete_ticket_task`, `delete_ticket`).
2. **`UpdateTicketTaskInput` has no `status`**, and `update_ticket_task` raises `ValueError` if `changes`
   names one. The repository's `update` writes whatever it is given, so without the guard an internal
   caller, such as an import, could still bypass the rule. The status notices, `_task_status_notice`,
   `TASK_STATUS_LABELS` and `OPEN_TASK_STATUSES` were removed with it. No site screen calls
   `updateTicketTask`.
3. **A claim on a deleted need, or on any need of a deleted request, cannot be changed**:
   `update_task_assignment` answers `Ticket task not found`, as a claim and a stop do. It is checked after
   authorization, so a caller who may not change the claim cannot learn whether the need was deleted.
   Giving the place back still works (`unassign_task_actor`): a deletion must not trap anyone on a need.

**Consequences**:
➕ Every change of a need's status comes with its notice and its timestamps; none can happen silently.
➕ The record of who was on a deleted need stays as it was when the need went.
➖ The back office cannot mark a need done by hand. "Done" has no state: volunteers do not report progress
on the site.
➖ Needs still carrying a status from before (`in_progress`, `completed`) are not migrated. The claim check
takes both as open, like `pending`; working out a request's status (`OPEN_NEED_STATUSES`) counts
`in_progress` as open but not `completed`. Reset or migrate such data before relying on either.

---

### ADR-456 Volunteer numbers count 人力 needs only, and the dashboard's gap is the ticket board's

> **Status: ACCEPTED (2026-11-02).** The designer's calls on 2026-11-01 and 2026-11-02: the dashboard's
> 志工缺口 shows the number the ticket board's stats strip shows, counting the needs still recruiting only,
> and says how many needs are short, as the strip does; then, on #247 on 2026-11-02, the volunteer numbers
> on both pages count 人力 needs only, and supply needs get counts of their own. Scheduled for the backend
> on 2026-11-02. Whether 醫療 counts as 人力 is still being asked (point 1).

**In plain words**: the volunteer numbers count only the needs volunteers sign up for, 人力. A supply need
asks for things (84 lunch boxes are not 84 volunteers), and a rescue's head count is not filled by people
signing up. Supply needs are counted instead: how many there are, and how many nobody has taken yet. The
dashboard's 志工缺口 and the one above the ticket board give the same number, and the dashboard can also say
how many needs are still short of people. A need with more people than it asks for no longer lowers the
gap, and a need left open on a request closed by hand no longer raises it.

**Context**: Two queries count the gap. The ticket board's `ticketStats` (`tickets_repository.stats`)
reads today's rows: an open need with a quantity, on a request that is neither completed, cancelled nor
deleted, adds what it is short by the people on it, and only when it is short; `gapNeeds` counts those
needs. The dashboard's `volunteer_gap` (`ticket_analytics.get_volunteer_metric`) rebuilds each day from
audit_logs, and differed twice. It summed `quantity - matched` as it was, so a need whose quantity was cut
below its people (`update_ticket_task` allows that) took people off the other needs' gap. And it read no
request's status, so a need left open on a request closed by hand, before a request's status followed its
needs (2026-09-28, with no data migration), still counted. It had no count of needs either. Both counted
every type of need, so a supply need's items were added up as people, and on the demo data 物資 was the
dashboard's biggest bar of volunteers.

**Decision**:

1. **Only 人力 needs count as volunteers**: `volunteers_needed`, `volunteers_matched`, `volunteer_gap`,
   `volunteer_gap_needs`, and `ticketStats.gapPeople` and `gapNeeds`. Supply, rescue and 醫療 needs add
   nothing to them. The types are listed once, in `VOLUNTEER_NEED_TYPES` (`app/services/ticket_status.py`):
   both queries read it, and so do the catalog's descriptions, which name the types. If 醫療 is to count,
   it is added there.
2. **The gap counts each need from 0.** Of the needs recruiting at that instant (standing, open, not
   stopped by hand), each adds `quantity - matched` when that is above 0, and nothing otherwise.
3. **`volunteer_gap_needs`**, a new y-metric (還缺人的需求, 項), counts those needs. It has every shape
   `volunteer_gap` has: a total, one per need type, and a daily trend capped like the gap's.
4. **Supply needs are counted, one each**, in 筆, since 便當, 箱水 and 鏟子 do not add up:
   `supply_needs` (物資需求) counts the supply needs standing, full and stopped ones included, and
   `supply_needs_unclaimed` (還沒人接的物資需求) those recruiting with nobody on them. A supply need with no
   quantity counts too. Each is a total as of now or the end of `end_date`, read from audit_logs like the
   rest, for the dashboard's 物資需求 card; neither has a trend or a breakdown.
5. **A need left open on a request closed now is short on no day.** Since 2026-09-28 every way a request
   closes closes its needs in the same commit: it completes once none is open, and deleting it or merging
   it away cancels or moves them. A need still open today on a request completed, cancelled or deleted
   today was therefore left open by a hand close before then, and nobody can claim it (ADR-291 point 4).
   The request is the one the need is on now, so a need a merge moved is judged by the request it moved
   to. Every other need keeps its history from audit_logs: a request completed or merged away since still
   shows its needs' gap on the days before. An unclaimed supply need follows the same rule.
6. **Today the two agree** for the same caller: both read `ticket.view`'s scope, and
   `test_the_dashboard_gap_is_the_ticket_boards` (`tests/test_analytics_api.py`) checks `volunteer_gap`
   and `volunteer_gap_needs` against `gapPeople` and `gapNeeds` over needs covering each old difference.
7. **`volunteers_needed` and `volunteers_matched` count as before, over 人力 needs.** They count every such
   need not canceled, full and stopped ones included, so the gap is not their difference, and the
   dashboard does not show it as one.

**Consequences**:
➕ The dashboard and the ticket board show one 志工缺口, in people, and both can say how many needs are short.
➕ Supply needs still show, in 筆, without their items passing for volunteers.
➖ The ticket board's 志工缺口 goes down where tickets ask for supplies or rescue; its tooltip should say
it counts 人力 needs.
➖ The dashboard's per-type volunteer chart is left with one bar, 人力. The designer asked whether to drop it
or split it by need name; that is the frontend's to draw, and nothing here changes for it.
➖ A request closed by hand before 2026-09-28 leaves its open needs out of the days before its close too:
the gap reads the history of needs and claims, not of requests.
➖ The rule lives in two queries. A change to it goes into both `tickets_repository.stats` and
`get_volunteer_metric`; the test in point 6 is there to catch a change made to only one.
◾ The scope, type and area filters still read today's request rows, as before.
◾ A building's shortfall (ADR-450) still adds 人力 and supply needs; whether it follows point 1 is being
asked. A supply need's quantity is still its number of places to claim, so the site's progress bars count
it as people; that is a separate question.
