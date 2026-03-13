export enum LateMarkingResponsibility {
  GATEKEEPER = 'GATEKEEPER',
  TAKER = 'TAKER',
  CLASS_TEACHER = 'CLASS_TEACHER',
  FIRST_PERIOD_TEACHER = 'FIRST_PERIOD_TEACHER',
}

export enum LateAttendanceStatus {
  PRESENT = 'PRESENT',
  LATE = 'LATE',
  HALFDAY = 'HALFDAY',
  ABSENT = 'ABSENT',
}

export enum AttendanceTrackingStrategy {
  ATTENDANCE_SIMPLE = 'ATTENDANCE_SIMPLE',
  GATE_MARKING = 'GATE_MARKING',
  TAKER_MARKING = 'TAKER_MARKING',
}

export enum AttendanceMode {
  DAILY = 'DAILY',
  PERIOD_WISE = 'PERIOD_WISE',
}

export enum DailyAttendanceAccess {
  CLASS_TEACHER = 'CLASS_TEACHER',
  FIRST_PERIOD_TEACHER = 'FIRST_PERIOD_TEACHER',
}
