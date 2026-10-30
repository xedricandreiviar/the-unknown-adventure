# Barangay Wawa United — Rebuild Roadmap

Brief: redesign (deep green + gold, community feel), 3 parts (landing, PWD portal, court booking), Lovable Cloud DB, email auth with resident/admin roles.

1. [x] Pull logo + real photos from Drive zip; upload as CDN assets; favicon
2. [x] Design system in src/styles.css (forest green/gold/cream, serif display + sans body)
3. [ ] Database migration: profiles, user_roles, bookings, announcements, officials, service_requests, complaints, pwd_inquiries, faqs + RLS + seed data
4. [ ] Auth: enable email auth, Google + Lovable sign-in; admin helper (login/signup page done — /auth)
5. [x] Shared shell: header (live clock, nav, mobile menu), footer, hotlines modal
6. [x] Landing page (hero w/ today's court schedule widget, announcements, services, map, FAQ, consent)
7. [x] Announcements page (static; DB-backed filters come with task 3)
8. [ ] Services page + request submission + tracking (track page by code)
9. [x] Officials page (placeholder roster)
10. [x] Contact page (map, hotlines, FAQ, legal links)
11. [ ] Court booking (calendar, slot colors, book/confirm, cancel, admin approve/block)
12. [ ] PWD portal (guides, searchable benefits, accessibility toolbar, inquiry form)
13. [ ] My Account (basic page done; bookings/requests list comes with task 3) (bookings, requests, complaints, consents)
14. [ ] Admin dashboard
15. [x] Privacy/Terms/Data Privacy Act pages
16. [ ] Tests for rules that matter (double-booking prevention, roles)
17. [ ] Verify end-to-end in preview
