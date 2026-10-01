# Decisions: 020 Volunteer Claim

Flow A of the site revamp: a volunteer claims one need of a request, not the whole request, and a
request's owner can stop recruiting for one need. Numbering continues the repo-wide ADR sequence: flow A
holds ADR-291 to ADR-293 (flow C took ADR-287 to ADR-290 and ADR-294; flow B starts at ADR-295).

The rules below were set by the team on 2026-09-28 and by the product owner between 2026-09-26 and
2026-09-30. Comments in `app/services/ticket.py` and in flow A's tests cite them as "spec Q37" and so on;
the table at the end maps those numbers to the rules here.

Terms: a **request** is a `tickets` row; a **need** is one of its `ticket_tasks` rows, with an optional
`quantity` of people; a **claim** is a `task_assignments` row linking a person to a need. The site says
求助 for a request and 需求 for a need.

---

### ADR-291 A need takes people up to its quantity, from anyone, and the claim that fills it fulfils it

> **Status: ACCEPTED (2026-10-01).** Rules decided by the team on 2026-09-28. That the cap binds
> coordinators too was the product owner's call the same day, against flow A's proposal to keep their
> over-assignment; the order of the checks was settled on 2026-09-30.

**In plain words**: a need that asks for 3 people takes 3, whether they sign up themselves or a coordinator
sends them. The third claim marks it fulfilled: it has everyone it asked for, and they still go. If one of
them gives the place back, the need recruits again.

**Context**: Before this flow, a claim (`assign_task_actor`) checked nothing but duplicates. A need asking
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
   - giving a place back, and the reopening it may cause, send nothing.

**Consequences**:
➕ "Full" and "fulfilled" are kept by the backend, not by someone remembering to set them.
➕ The site can tell a full need from a closed one, and show a volunteer the need they claimed even after it
fills (`TicketTaskType.myAssignment`).
➖ A coordinator cannot over-staff a need any more; the back office has to add another need.
➖ Needs over-staffed before the cap keep their extra people; the cap only stops new claims.

---

### ADR-292 A request's owner stops recruiting one need at a time, and that need's people are then final

> **Status: ACCEPTED (2026-10-01).** Stopping per need was decided by the team on 2026-09-28, replacing
> a whole-request stop built two days earlier. Refusing a need nobody claimed, the notice, and refusing
> to give places back afterwards were the product owner's calls on 2026-09-28 and 2026-09-29.

**In plain words**: when a need has enough people, its owner can stop recruiting for it ("3 of 5 is
enough"). The 3 stay on it and still go; nobody else can claim it; none of the 3 can give the place back.
It cannot be undone: to recruit again, add another need.

**Context**: The site prototype had a whole-request 「刪除媒合單」 that closed every need at once. Flow A first
built it as `stopRecruiting(ticketUuid)`, which cancelled every open need of a request. On 2026-09-28 the
team ruled that stopping is per need, that cancelling means deleting (flow B's `deleteTicketTask` and
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

> **Status: ACCEPTED (2026-10-01).** The first part was agreed by the team with flows A and B on 2026-09-28;
> the guard inside the service was the product owner's call on 2026-09-30. The second part was decided on
> 2026-09-30, after flow B found the gap while checking that deleted rows stay hidden.

**In plain words**: nobody sets a need's status by hand any more. A need is fulfilled when it fills or is
stopped, reopens when a place frees, and is cancelled when it is deleted. Once a need is deleted, the claims
on it are kept unchanged, as the record of who was on it.

**Context**: `updateTicketTask` took a `status`, so a need could be set to anything, `in_progress` included,
each change sending its own notice (`_task_status_notice`). With ADR-291 and ADR-292 in place, such an edit
could reopen a need its owner stopped, or close one without telling anyone. Separately, deleting a need or a
request (flow B) keeps its claims as a record, but `updateTaskAssignment` could still change their `status`
and `role`.

**Decision**:

1. **A need's status is `pending`, `fulfilled` or `canceled`.** `in_progress` is gone for needs; a request
   keeps it. Only these change a need's status, each sending its own notice and keeping its own timestamps:
   a claim (filling it, ADR-291), giving a place back (reopening it, ADR-291), stopping recruitment
   (ADR-292), and deletion (flow B).
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
in this flow.
➖ Needs still carrying a status from before (`scripts/seed_mock_scenarios.sql` has `in_progress` and
`completed`) are not migrated. The claim check takes both as open, like `pending`; working out a
request's status (`OPEN_NEED_STATUSES`) counts `in_progress` as open but not `completed`. Reset or migrate
such data before relying on either.

---

## Spec numbers cited in code

Flow A's working spec numbered its decisions Q1, Q2 and so on. These are the ones the backend's comments
and tests cite, with where each now stands. Flow B's tests (`test_help_request_api.py`,
`test_add_ticket_task.py`) cite flow B's own spec, whose numbers are unrelated.

| Number | Rule | Where |
|---|---|---|
| Q5 | A claim is refused on a fulfilled or cancelled need; a need pending review can be claimed | ADR-291 |
| Q7 | `TicketTaskType.myAssignment` is the viewer's own claim (null to a guest); who claimed a need (`assignments`) is restricted | ADR-286 |
| Q12 | Claiming did not unlock the owner's contact details | overturned by ADR-286 |
| Q16 | `myTaskAssignments`: the caller's claims with their need and request, newest first, unpaged; deleted needs and requests left out, fulfilled ones listed | `list_my_claims` |
| Q18 | Notices: the owner on every claim, named after the person going; everyone on a need when it fills; none when a place is given back | ADR-291 |
| Q22 | Status-change notices in Chinese | superseded by Q41 (ADR-293) |
| Q28 | A need of a completed or cancelled request takes nobody | ADR-291 |
| Q36 | Contact details open to everyone signed in | ADR-286 |
| Q37 | The claim that fills a need fulfils it; the order of the claim checks | ADR-291 |
| Q38 | The quantity caps coordinators too (reverses `d847624`) | ADR-291 |
| Q39 | Stopping recruitment, per need | ADR-292 |
| Q40 | Giving a place back reopens a need that filled by itself | ADR-291 |
| Q41 | A need's status moves only through claims, releases, stopping and deletion | ADR-293 |
| Q43 | Cancelling a need or a request means deleting it (flow B) | flow B |
| Q44 | A request's status follows its needs (flow B); lock the request, then the need | ADR-291 (lock order) |
| Q46 | No place can be given back on a stopped need | ADR-292 |
| Q47 | A deleted need's claims cannot be changed | ADR-293 |
