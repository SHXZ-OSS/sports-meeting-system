import { Class, Competition, Registration, Student } from "../types";
import { chineseSort } from "./sort";

export interface RandomFillAssignment {
  competitionId: number;
  competitionName: string;
  studentId: number;
  studentName: string;
  studentGender: number;
}

export type RandomFillStatus = "satisfied" | "filled" | "partial" | "skipped";

export interface RandomFillCompetitionResult {
  competitionId: number;
  competitionName: string;
  competitionType: Competition["competition_type"];
  gender: number;
  beforeTotal: number;
  beforeFemale: number;
  beforeMale: number;
  plannedTotal: number;
  plannedFemale: number;
  plannedMale: number;
  afterTotal: number;
  afterFemale: number;
  afterMale: number;
  minTotal: number;
  maxTotal: number;
  minFemale: number;
  maxFemale: number;
  minMale: number;
  maxMale: number;
  status: RandomFillStatus;
  reason?: string;
  assignments: RandomFillAssignment[];
}

export interface RandomFillPlan {
  classId: number;
  className: string;
  studentCount: number;
  totalAssigned: number;
  assignments: RandomFillAssignment[];
  competitions: RandomFillCompetitionResult[];
}

export interface PlanRandomFillParams {
  classInfo: Class;
  students: Student[];
  competitions: Competition[];
  registrations: Registration[];
}

interface GenderCounts {
  total: number;
  female: number;
  male: number;
}

interface TimeInterval {
  start: number;
  end: number;
  allowConcurrent: boolean;
}

interface StudentSnapshot {
  load: number;
  registered: Set<number>;
  intervals: TimeInterval[];
}

interface DemandBase {
  competition: Competition;
  current: GenderCounts;
  // 2 = 女生名额，1 = 男生名额，0 = 不限性别
  slots: number[];
}

interface SimAssignment {
  studentId: number;
  studentName: string;
  gender: number;
}

interface SimDemand extends DemandBase {
  planned: GenderCounts;
  assignments: SimAssignment[];
}

interface SimStudent {
  id: number;
  name: string;
  gender: number;
  load: number;
  registered: Set<number>;
  intervals: TimeInterval[];
}

interface SimResult {
  demands: SimDemand[];
  filled: number;
  unmet: number;
  maxLoad: number;
  sumSquares: number;
}

/**
 * 随机补足报名计划（纯前端）。
 *
 * 优化目标按优先级排列：
 * 1. 尽量满足每个项目的最低总人数、女生人数、男生人数；
 * 2. 在满足要求的前提下，让每名学生在当前运动会中的报名项目总数
 *    尽量均衡（包含已报名和本次新增；最大负担最小，负担平方和最小）。
 *
 * 硬约束：项目可报名状态、性别限制、每班人数上下限、同一项目不重复报名、
 * 时间冲突（按 allowConcurrent 判断）。
 *
 * 算法：先为每个项目计算缺口并拆成“女生/男生/不限性别”名额；再运行多轮
 * 随机贪心，每轮优先处理可选学生最少的项目，在可选学生中选择当前负担最小
 * 者（同等负担随机），最后按上述目标挑选最优轮次。这是启发式算法，不保证
 * 全局最优，但对班级规模的数据足够快，且每次预览都不会写入报名。
 */
export function planRandomFill({
  classInfo,
  students,
  competitions,
  registrations,
}: PlanRandomFillParams): RandomFillPlan {
  const competitionMap = new Map(
    competitions.map((competition) => [competition.id, competition]),
  );
  const studentMap = new Map(students.map((student) => [student.id, student]));
  const classStudentIds = new Set(students.map((student) => student.id));
  const snapshots = new Map<number, StudentSnapshot>();
  const currentCounts = new Map<number, GenderCounts>();

  collectCurrentRegistrations(
    registrations,
    classStudentIds,
    studentMap,
    competitionMap,
    snapshots,
    currentCounts,
  );

  const results: RandomFillCompetitionResult[] = [];
  const demands: DemandBase[] = [];

  for (const competition of competitions) {
    if (competition.competition_type === "school") {
      continue;
    }

    const current = currentCounts.get(competition.id) ?? emptyCounts();
    const result = createEmptyResult(competition, current);
    const deficits = computeDeficits(competition, current);

    if (!deficits.hasDeficit) {
      result.status = "satisfied";
      results.push(result);
      continue;
    }

    if (competition.status !== "approved") {
      result.status = "skipped";
      result.reason = "当前项目状态不可报名";
      results.push(result);
      continue;
    }

    if (competition.custom_fields?.some((field) => field.required)) {
      result.status = "skipped";
      result.reason = "项目包含必填自定义字段，请手动填写后报名";
      results.push(result);
      continue;
    }

    const slots = buildSlots(competition, current);
    if (slots.length === 0) {
      const missing = buildMissingDescription(result);
      result.status = "skipped";
      result.reason = missing
        ? `班级报名人数已达上限，${missing}`
        : "班级报名人数已达上限";
      results.push(result);
      continue;
    }

    demands.push({ competition, current, slots });
    results.push(result);
  }

  if (students.length === 0 || demands.length === 0) {
    const demandIds = new Set(demands.map((demand) => demand.competition.id));
    if (students.length === 0) {
      for (const result of results) {
        if (demandIds.has(result.competitionId)) {
          result.status = "partial";
          result.reason = "该班级暂无可报名学生";
        }
      }
    }
    return assemblePlan(classInfo, results, null, students.length);
  }

  let best: SimResult | null = null;
  for (let attempt = 0; attempt < RANDOM_ATTEMPTS; attempt += 1) {
    const simulation = simulate(demands, students, snapshots);
    if (!best || isBetterSimulation(simulation, best)) {
      best = simulation;
    }
  }

  return assemblePlan(classInfo, results, best, students.length);
}

const RANDOM_ATTEMPTS = 32;

function collectCurrentRegistrations(
  registrations: Registration[],
  classStudentIds: Set<number>,
  studentMap: Map<number, Student>,
  competitionMap: Map<number, Competition>,
  snapshots: Map<number, StudentSnapshot>,
  currentCounts: Map<number, GenderCounts>,
) {
  for (const registration of registrations) {
    if (!classStudentIds.has(registration.student_id)) {
      continue;
    }

    const student = studentMap.get(registration.student_id);
    if (!student) {
      continue;
    }

    let snapshot = snapshots.get(student.id);
    if (!snapshot) {
      snapshot = { load: 0, registered: new Set(), intervals: [] };
      snapshots.set(student.id, snapshot);
    }

    // 同一学生同一项目只应有一条报名，避免历史脏数据影响公平性
    if (snapshot.registered.has(registration.competition_id)) {
      continue;
    }

    snapshot.load += 1;
    snapshot.registered.add(registration.competition_id);

    const competition = competitionMap.get(registration.competition_id);
    if (competition) {
      const interval = toTimeInterval(competition);
      if (interval) {
        snapshot.intervals.push(interval);
      }
    }

    const counts =
      currentCounts.get(registration.competition_id) ?? emptyCounts();
    counts.total += 1;
    if (student.gender === 2) {
      counts.female += 1;
    } else if (student.gender === 1) {
      counts.male += 1;
    }
    currentCounts.set(registration.competition_id, counts);
  }
}

function createEmptyResult(
  competition: Competition,
  current: GenderCounts,
): RandomFillCompetitionResult {
  const isMixed = competition.gender === 3;
  return {
    competitionId: competition.id,
    competitionName: competition.name,
    competitionType: competition.competition_type,
    gender: competition.gender,
    beforeTotal: current.total,
    beforeFemale: current.female,
    beforeMale: current.male,
    plannedTotal: 0,
    plannedFemale: 0,
    plannedMale: 0,
    afterTotal: current.total,
    afterFemale: current.female,
    afterMale: current.male,
    minTotal: competition.min_participants_per_class,
    maxTotal: competition.max_participants_per_class,
    minFemale: isMixed ? competition.min_female_per_class : 0,
    maxFemale: isMixed ? competition.max_female_per_class : 0,
    minMale: isMixed ? competition.min_male_per_class : 0,
    maxMale: isMixed ? competition.max_male_per_class : 0,
    status: "satisfied",
    assignments: [],
  };
}

interface Deficits {
  total: number;
  female: number;
  male: number;
  hasDeficit: boolean;
}

function computeDeficits(
  competition: Competition,
  current: GenderCounts,
): Deficits {
  const isMixed = competition.gender === 3;
  const total = Math.max(
    0,
    competition.min_participants_per_class - current.total,
  );
  const female = isMixed
    ? Math.max(0, competition.min_female_per_class - current.female)
    : 0;
  const male = isMixed
    ? Math.max(0, competition.min_male_per_class - current.male)
    : 0;
  return {
    total,
    female,
    male,
    hasDeficit: total > 0 || female > 0 || male > 0,
  };
}

function buildSlots(competition: Competition, current: GenderCounts): number[] {
  const deficits = computeDeficits(competition, current);
  let totalSlots = Math.max(deficits.total, deficits.female + deficits.male);

  if (competition.max_participants_per_class > 0) {
    const capacity = Math.max(
      0,
      competition.max_participants_per_class - current.total,
    );
    totalSlots = Math.min(totalSlots, capacity);
  }

  if (totalSlots <= 0) {
    return [];
  }

  const isMixed = competition.gender === 3;
  const femaleCapacity =
    isMixed && competition.max_female_per_class > 0
      ? Math.max(0, competition.max_female_per_class - current.female)
      : totalSlots;
  const maleCapacity =
    isMixed && competition.max_male_per_class > 0
      ? Math.max(0, competition.max_male_per_class - current.male)
      : totalSlots;

  let femaleSlots = Math.min(deficits.female, femaleCapacity);
  let maleSlots = Math.min(deficits.male, maleCapacity);

  if (femaleSlots + maleSlots > totalSlots) {
    [femaleSlots, maleSlots] = allocateGenderSlots(
      totalSlots,
      femaleSlots,
      maleSlots,
    );
  }

  const freeSlots = totalSlots - femaleSlots - maleSlots;
  const slots: number[] = [];
  for (let i = 0; i < femaleSlots; i += 1) {
    slots.push(2);
  }
  for (let i = 0; i < maleSlots; i += 1) {
    slots.push(1);
  }
  for (let i = 0; i < freeSlots; i += 1) {
    slots.push(0);
  }
  return slots;
}

// 在总名额受限时，把名额尽量公平地分给男女两类最低要求
function allocateGenderSlots(
  total: number,
  femaleNeed: number,
  maleNeed: number,
): [number, number] {
  let remaining = total;
  let female = 0;
  let male = 0;

  if (remaining > 0 && femaleNeed > 0) {
    female += 1;
    remaining -= 1;
  }
  if (remaining > 0 && maleNeed > 0) {
    male += 1;
    remaining -= 1;
  }

  while (remaining > 0) {
    const femaleLeft = femaleNeed - female;
    const maleLeft = maleNeed - male;
    if (femaleLeft <= 0 && maleLeft <= 0) {
      break;
    }
    if (femaleLeft >= maleLeft) {
      female += 1;
    } else {
      male += 1;
    }
    remaining -= 1;
  }

  return [female, male];
}

function createSimStudents(
  students: Student[],
  snapshots: Map<number, StudentSnapshot>,
): SimStudent[] {
  return students.map((student) => {
    const snapshot = snapshots.get(student.id);
    return {
      id: student.id,
      name: student.full_name,
      gender: student.gender,
      load: snapshot?.load ?? 0,
      registered: new Set<number>(snapshot ? snapshot.registered : []),
      intervals: snapshot ? [...snapshot.intervals] : [],
    };
  });
}

function createSimDemands(demands: DemandBase[]): SimDemand[] {
  return demands.map((demand) => ({
    ...demand,
    slots: randomizeRequiredSlots(demand.slots),
    planned: emptyCounts(),
    assignments: [],
  }));
}

// 必填性别名额先分配，剩余的不限性别名额放在最后
function randomizeRequiredSlots(slots: number[]): number[] {
  const required = slots.filter((gender) => gender !== 0);
  const free = slots.filter((gender) => gender === 0);
  for (let i = required.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [required[i], required[j]] = [required[j], required[i]];
  }
  return [...required, ...free];
}

function simulate(
  demands: DemandBase[],
  students: Student[],
  snapshots: Map<number, StudentSnapshot>,
): SimResult {
  const simStudents = createSimStudents(students, snapshots);
  const simDemands = createSimDemands(demands);
  let remaining = simDemands.reduce(
    (total, demand) => total + demand.slots.length,
    0,
  );

  while (remaining > 0) {
    const selected = selectDemand(simDemands, simStudents);
    if (!selected) {
      break;
    }
    const student = selectStudent(selected.pool);
    assignStudent(selected.demand, student);
    selected.demand.slots.shift();
    remaining -= 1;
  }

  return evaluateSimulation(simDemands, simStudents);
}

interface SelectedDemand {
  demand: SimDemand;
  pool: SimStudent[];
}

// 优先处理可选学生最少的项目，避免被其他项目抢走唯一人选
function selectDemand(
  demands: SimDemand[],
  students: SimStudent[],
): SelectedDemand | null {
  let selected: SelectedDemand | null = null;

  for (const demand of demands) {
    if (demand.slots.length === 0) {
      continue;
    }

    const requiredGender = demand.slots[0];
    let pool = eligibleStudents(demand, requiredGender, students);
    if (
      pool.length === 0 &&
      requiredGender !== 0 &&
      demand.current.total + demand.planned.total <
        demand.competition.min_participants_per_class
    ) {
      // 仅当总人数仍未达到下限时，才用其他性别补足；
      // 避免总人数已达标时产生与最低要求无关的多余报名
      pool = eligibleStudents(demand, 0, students);
    }
    if (pool.length === 0) {
      continue;
    }

    if (!selected || isMoreConstrained(demand, pool, selected)) {
      selected = { demand, pool };
    }
  }

  return selected;
}

function isMoreConstrained(
  demand: SimDemand,
  pool: SimStudent[],
  selected: SelectedDemand,
): boolean {
  if (pool.length !== selected.pool.length) {
    return pool.length < selected.pool.length;
  }
  if (demand.slots.length !== selected.demand.slots.length) {
    return demand.slots.length < selected.demand.slots.length;
  }
  return Math.random() < 0.5;
}

function eligibleStudents(
  demand: SimDemand,
  requiredGender: number,
  students: SimStudent[],
): SimStudent[] {
  return students.filter((student) =>
    isEligible(demand, requiredGender, student),
  );
}

function isEligible(
  demand: SimDemand,
  requiredGender: number,
  student: SimStudent,
): boolean {
  const competition = demand.competition;

  if (student.registered.has(competition.id)) {
    return false;
  }
  if (competition.gender !== 3 && student.gender !== competition.gender) {
    return false;
  }
  if (requiredGender !== 0 && student.gender !== requiredGender) {
    return false;
  }

  if (
    competition.max_participants_per_class > 0 &&
    demand.current.total + demand.planned.total >=
      competition.max_participants_per_class
  ) {
    return false;
  }

  if (competition.gender === 3) {
    if (
      student.gender === 2 &&
      competition.max_female_per_class > 0 &&
      demand.current.female + demand.planned.female >=
        competition.max_female_per_class
    ) {
      return false;
    }
    if (
      student.gender === 1 &&
      competition.max_male_per_class > 0 &&
      demand.current.male + demand.planned.male >=
        competition.max_male_per_class
    ) {
      return false;
    }
  }

  return !hasTimeConflict(competition, student.intervals);
}

function hasTimeConflict(
  competition: Competition,
  intervals: TimeInterval[],
): boolean {
  const interval = toTimeInterval(competition);
  if (!interval) {
    return false;
  }

  return intervals.some(
    (existing) =>
      interval.start < existing.end &&
      existing.start < interval.end &&
      !interval.allowConcurrent &&
      !existing.allowConcurrent,
  );
}

function selectStudent(pool: SimStudent[]): SimStudent {
  const minLoad = Math.min(...pool.map((student) => student.load));
  const candidates = pool.filter((student) => student.load === minLoad);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function assignStudent(demand: SimDemand, student: SimStudent) {
  student.load += 1;
  student.registered.add(demand.competition.id);

  const interval = toTimeInterval(demand.competition);
  if (interval) {
    student.intervals.push(interval);
  }

  demand.planned.total += 1;
  if (student.gender === 2) {
    demand.planned.female += 1;
  } else if (student.gender === 1) {
    demand.planned.male += 1;
  }
  demand.assignments.push({
    studentId: student.id,
    studentName: student.name,
    gender: student.gender,
  });
}

function evaluateSimulation(
  demands: SimDemand[],
  students: SimStudent[],
): SimResult {
  let filled = 0;
  let unmet = 0;

  for (const demand of demands) {
    filled += demand.assignments.length;
    const competition = demand.competition;
    const afterTotal = demand.current.total + demand.planned.total;
    const afterFemale = demand.current.female + demand.planned.female;
    const afterMale = demand.current.male + demand.planned.male;

    unmet += Math.max(0, competition.min_participants_per_class - afterTotal);
    if (competition.gender === 3) {
      unmet += Math.max(0, competition.min_female_per_class - afterFemale);
      unmet += Math.max(0, competition.min_male_per_class - afterMale);
    }
  }

  const loads = students.map((student) => student.load);
  const maxLoad = loads.length > 0 ? Math.max(...loads) : 0;
  const sumSquares = loads.reduce((total, load) => total + load * load, 0);

  return { demands, filled, unmet, maxLoad, sumSquares };
}

function isBetterSimulation(current: SimResult, best: SimResult): boolean {
  if (current.unmet !== best.unmet) {
    return current.unmet < best.unmet;
  }
  if (current.filled !== best.filled) {
    return current.filled > best.filled;
  }
  if (current.maxLoad !== best.maxLoad) {
    return current.maxLoad < best.maxLoad;
  }
  return current.sumSquares < best.sumSquares;
}

function assemblePlan(
  classInfo: Class,
  results: RandomFillCompetitionResult[],
  best: SimResult | null,
  studentCount: number,
): RandomFillPlan {
  const resultMap = new Map(
    results.map((result) => [result.competitionId, result]),
  );

  if (best) {
    for (const demand of best.demands) {
      const result = resultMap.get(demand.competition.id);
      if (!result) {
        continue;
      }

      const sortedAssignments = [...demand.assignments].sort((a, b) =>
        chineseSort(a.studentName, b.studentName),
      );
      result.assignments = sortedAssignments.map((assignment) => ({
        competitionId: demand.competition.id,
        competitionName: demand.competition.name,
        studentId: assignment.studentId,
        studentName: assignment.studentName,
        studentGender: assignment.gender,
      }));
      result.plannedTotal = demand.planned.total;
      result.plannedFemale = demand.planned.female;
      result.plannedMale = demand.planned.male;
      result.afterTotal = result.beforeTotal + demand.planned.total;
      result.afterFemale = result.beforeFemale + demand.planned.female;
      result.afterMale = result.beforeMale + demand.planned.male;

      const evaluation = evaluateRequirementStatus(result);
      result.status = evaluation.status;
      result.reason = evaluation.reason;
    }
  }

  const assignments = results.flatMap((result) => result.assignments);
  return {
    classId: classInfo.id,
    className: classInfo.name,
    studentCount,
    totalAssigned: assignments.length,
    assignments,
    competitions: results,
  };
}

function evaluateRequirementStatus(result: RandomFillCompetitionResult): {
  status: RandomFillStatus;
  reason?: string;
} {
  const isMixed = result.gender === 3;
  const totalMet =
    result.minTotal === 0 || result.afterTotal >= result.minTotal;
  const femaleMet =
    !isMixed ||
    result.minFemale === 0 ||
    result.afterFemale >= result.minFemale;
  const maleMet =
    !isMixed || result.minMale === 0 || result.afterMale >= result.minMale;

  if (totalMet && femaleMet && maleMet) {
    return { status: result.plannedTotal > 0 ? "filled" : "satisfied" };
  }
  if (result.plannedTotal === 0) {
    return {
      status: "partial",
      reason: "没有符合条件的可分配学生（性别、时间冲突或人数上限）",
    };
  }
  return { status: "partial", reason: buildPartialReason(result) };
}

function buildPartialReason(result: RandomFillCompetitionResult): string {
  const missing = buildMissingDescription(result);
  return missing
    ? `受性别、时间冲突或人数上限限制，${missing}`
    : "部分名额未能分配";
}

function buildMissingDescription(result: RandomFillCompetitionResult): string {
  const missing: string[] = [];
  if (result.minTotal > 0 && result.afterTotal < result.minTotal) {
    missing.push(`总人数还差 ${result.minTotal - result.afterTotal} 人`);
  }
  if (result.gender === 3) {
    if (result.minFemale > 0 && result.afterFemale < result.minFemale) {
      missing.push(`女生还差 ${result.minFemale - result.afterFemale} 人`);
    }
    if (result.minMale > 0 && result.afterMale < result.minMale) {
      missing.push(`男生还差 ${result.minMale - result.afterMale} 人`);
    }
  }
  return missing.join("、");
}

function emptyCounts(): GenderCounts {
  return { total: 0, female: 0, male: 0 };
}

function toTimeInterval(competition: Competition): TimeInterval | null {
  const start = parseTime(competition.start_time);
  const end = parseTime(competition.end_time);
  if (start === null || end === null || start >= end) {
    return null;
  }
  return {
    start,
    end,
    allowConcurrent: competition.allow_concurrent === true,
  };
}

function parseTime(value?: string): number | null {
  if (!value) {
    return null;
  }
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}
