# Tasks

[x] 1. Update frontend `AttendanceConfig` UI for coaching tenants. If `school.type === "COACHING"`, change the options:
    - Provide a single setting: "how attendance is marked".
    - "Every Period" maps to `AttendanceMode.PERIOD_WISE`.
    - "Only First Period" maps to `AttendanceMode.DAILY` with access set to `FIRST_PERIOD_TEACHER`.
    - Hide the normal mode & access switchers.
[x] 2. Update backend endpoints and logic to support `FIRST_PERIOD_TEACHER` authorization for coaching/daily mode.
[x] 3. Refine `PERIOD_WISE` attendance authorization to check subject assignment.
