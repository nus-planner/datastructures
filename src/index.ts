// Baskets
// Individual modules
// Focus Area
// Specializations
// Majors/Minors
// Basket Fulfillment Criterion/Rules
// Quantity e.g. at least X number
// Basket Relationships
// Prereqs
// Preclusions
import * as log from "./log";
import * as input from "./input";

const moduleRegex = /(?<prefix>[A-Z]+)(?<codeNumber>\d)\d+(?<suffix>[A-Z]*)/;

export class ModuleState {
  matchedBaskets: Array<Basket> = [];
}

export class Module {
  state: ModuleState = new ModuleState();
  prefix: string;
  suffix: string;
  code: string;
  level: number;
  name: string;
  credits: number;
  constructor(code: string, name: string, credits: number) {
    this.code = code;
    const match = moduleRegex.exec(code);
    if (match === null || match.groups === undefined) {
      throw new Error(`Invalid module code ${code}`);
    }
    this.level = Number.parseInt(match.groups["codeNumber"]);
    this.name = name;
    this.credits = credits;

    this.prefix = match.groups["prefix"] || "";
    this.suffix = match.groups["suffix"] || "";
  }

  resetState() {
    this.state = new ModuleState();
  }
}

export abstract class Filter {
  abstract filter(module: Module): boolean;

  getFilter() {
    return this.filter.bind(this);
  }
}

class PropertyFilter<K extends keyof Module> extends Filter {
  propertyName: K;
  equals: Module[K];
  negate: boolean;
  constructor(propertyName: K, equals: Module[K], negate: boolean = false) {
    super();
    this.propertyName = propertyName;
    this.equals = equals;
    this.negate = negate;
  }

  filter(module: Module): boolean {
    return this.negate
      ? module[this.propertyName] != this.equals
      : module[this.propertyName] == this.equals;
  }
}

class PropertyArrayFilter<K extends keyof Module> extends Filter {
  propertyName: K;
  arr: Array<Module[K]>;

  constructor(propertyName: K, arr: Array<Module[K]>) {
    super();
    this.propertyName = propertyName;
    this.arr = arr;
  }

  filter(module: Module): boolean {
    return !!this.arr.find((x) => x === module[this.propertyName]);
  }
}

class PropertySetFilter<K extends keyof Module> extends Filter {
  propertyName: K;
  set: Set<Module[K]>;

  constructor(propertyName: K, set: Set<Module[K]>) {
    super();
    this.propertyName = propertyName;
    this.set = set;
  }

  filter(module: Module): boolean {
    return !this.set.has(module[this.propertyName]);
  }
}

enum BinaryOp {
  GEQ,
  GT,
}

class CriterionFulfillmentResult {
  isFulfilled: boolean;
  matchedMCs: number;
  matchedModules: Set<Module>;

  constructor(
    isFulfilled: boolean = false,
    matchedMCs: number = 0,
    matchedModules: Set<Module> = new Set(),
  ) {
    this.isFulfilled = isFulfilled;
    this.matchedMCs = matchedMCs;
    this.matchedModules = matchedModules;
  }

  // This is relatively idempotent
  mergeResult(result: CriterionFulfillmentResult) {
    this.isFulfilled = this.isFulfilled || result.isFulfilled;
    this.matchedMCs = result.matchedMCs;
    for (const module of result.matchedModules) {
      this.matchedModules.add(module);
    }
  }
}

abstract class BasketEvent {}

class CriterionMatchModuleEvent extends BasketEvent {
  module: Module;
  constructor(module: Module) {
    super();
    this.module = module;
  }
}

class DoubleCountModuleEvent extends BasketEvent {
  module: Module;
  constructor(module: Module) {
    super();
    this.module = module;
  }
}

interface CriterionEventDelegate {
  acceptEvent(event: BasketEvent): void;
}

export type Constructor<T> = new (...args: any) => T;

export interface Criterion {
  criterionState: CriterionFulfillmentResult;
  eventDelegate?: CriterionEventDelegate;
  isFulfilled(academicPlan: AcademicPlanView): CriterionFulfillmentResult;
}

/**
 * A Basket is a collection of modules. In particular, a Basket can contain a single module
 */

export abstract class Basket implements Criterion, CriterionEventDelegate {
  name: string;
  criterionState: CriterionFulfillmentResult = new CriterionFulfillmentResult();
  parentBasket?: Basket;

  constructor(name: string = "") {
    this.name = name;
  }

  isTopLevelBasket(): boolean {
    return this.parentBasket === undefined;
  }

  abstract isFulfilled(
    academicPlan: AcademicPlanView,
  ): CriterionFulfillmentResult;

  isFulfilledWithState(
    academicPlan: AcademicPlanView,
  ): CriterionFulfillmentResult {
    const fulfilled = this.isFulfilled(academicPlan);
    this.criterionState.mergeResult(fulfilled);
    return this.criterionState;
  }

  abstract childBaskets(): Array<Basket>;

  resetSubtreeState() {
    this.criterionState = new CriterionFulfillmentResult();
    this.childBaskets().forEach((basket) => basket.resetSubtreeState());
  }

  sendEventUpwards(event: BasketEvent) {
    for (
      let current: Basket | undefined = this;
      current !== undefined;
      current = current.parentBasket
    ) {
      current.acceptEvent(event);
    }
  }

  acceptEvent(event: BasketEvent): void {
    if (event instanceof CriterionMatchModuleEvent) {
      event.module.state.matchedBaskets.push(this);
    } else if (event instanceof DoubleCountModuleEvent) {
      event.module.state.matchedBaskets.push(this);
      this.criterionState.matchedModules.add(event.module);
    }
  }

  hasMeaningfulName(): boolean {
    return this.name.length > 0;
  }

  getPrintableClone(meaningfulDepth: number = 2): PrintableBasket {
    const clone = new PrintableBasket(this);
    if (meaningfulDepth > 0) {
      for (const child of this.childBaskets()) {
        if (!child.hasMeaningfulName) {
          clone.children.push(child.getPrintableClone(meaningfulDepth));
        } else {
          clone.children.push(child.getPrintableClone(meaningfulDepth - 1));
        }
      }
    }
    return clone;
  }
}

class PrintableCriterionState {
  isFulfilled: boolean;
  matchedMCs: number;
  matchedModules: Array<string> = [];
  constructor(criterionState: CriterionFulfillmentResult) {
    this.isFulfilled = criterionState.isFulfilled;
    this.matchedMCs = criterionState.matchedMCs;
    for (const module of criterionState.matchedModules) {
      this.matchedModules.push(module.code);
    }
  }
}

class PrintableBasket {
  name: string;
  children: Array<PrintableBasket> = [];
  criterionState: PrintableCriterionState;
  constructor(basket: Basket) {
    this.name = basket.name;
    this.criterionState = new PrintableCriterionState(basket.criterionState);
  }
}

export class BasketState {
  moduleCodesAlreadyMatched: Set<string>;
  constructor(moduleCodesAlreadyMatched: Set<string> = new Set()) {
    this.moduleCodesAlreadyMatched = moduleCodesAlreadyMatched;
  }
}

export class StatefulBasket extends Basket {
  basket: Basket;
  state: BasketState;
  constructor(basket: Basket, state: BasketState = new BasketState()) {
    super();
    this.basket = basket;
    this.basket.parentBasket = this;
    this.state = state;
  }

  childBaskets(): Basket[] {
    return [this.basket];
  }

  isFulfilled(academicPlan: AcademicPlanView): CriterionFulfillmentResult {
    return this.basket.isFulfilledWithState(
      academicPlan.withModulesFilteredBy(
        new PropertySetFilter("code", this.state.moduleCodesAlreadyMatched),
      ),
    );
  }

  acceptEvent(event: BasketEvent): void {
    super.acceptEvent(event);
    if (event instanceof CriterionMatchModuleEvent) {
      this.state.moduleCodesAlreadyMatched.add(event.module.code);
    }
  }
}

export class ArrayBasket extends Basket {
  baskets: Array<Basket>;
  binaryOp: BinaryOp;
  n: number;
  earlyTerminate: boolean;

  constructor(
    name: string,
    baskets: Array<Basket>,
    binaryOp: BinaryOp,
    n: number,
    earlyTerminate: boolean,
  ) {
    super(name);
    this.baskets = baskets;
    this.baskets.forEach((basket) => (basket.parentBasket = this));
    this.binaryOp = binaryOp;
    this.n = n;
    this.earlyTerminate = earlyTerminate;
  }

  static or(name: string, baskets: Array<Basket>): ArrayBasket {
    return new ArrayBasket(name, baskets, BinaryOp.GEQ, 1, true);
  }

  static and(name: string, baskets: Array<Basket>): ArrayBasket {
    return new ArrayBasket(name, baskets, BinaryOp.GEQ, baskets.length, false);
  }

  static atLeastN(name: string, n: number, basket: Array<Basket>): ArrayBasket {
    return new ArrayBasket(name, basket, BinaryOp.GEQ, n, true);
  }

  childBaskets(): Basket[] {
    return this.baskets;
  }

  isFulfilled(academicPlan: AcademicPlanView): CriterionFulfillmentResult {
    let fulfilled;
    let fulfilledCount = 0;
    let toMatch = 0;
    switch (this.binaryOp) {
      case BinaryOp.GEQ:
        toMatch = this.n;
        break;
      case BinaryOp.GT:
        toMatch = this.n + 1;
        break;
    }
    if (this.earlyTerminate) {
      for (let basket of this.baskets) {
        if (!basket.isFulfilledWithState(academicPlan).isFulfilled) {
          continue;
        }
        fulfilledCount++;
        if (fulfilledCount >= toMatch) {
          break;
        }
      }
    } else {
      for (let basket of this.baskets) {
        if (!basket.isFulfilledWithState(academicPlan).isFulfilled) {
          continue;
        }
        fulfilledCount++;
      }
    }
    fulfilled = fulfilledCount >= toMatch;

    let totalMCs = 0;
    const allMatchedModules = new Set<Module>();
    for (let basket of this.baskets) {
      totalMCs += basket.criterionState.matchedMCs;
      for (const module of basket.criterionState.matchedModules) {
        allMatchedModules.add(module);
      }
    }

    return fulfilled
      ? new CriterionFulfillmentResult(true, totalMCs, allMatchedModules)
      : new CriterionFulfillmentResult(false, totalMCs, allMatchedModules);
  }
  acceptEvent(event: BasketEvent): void {
    super.acceptEvent(event);
  }
}

export class FulfillmentResultBasket extends Basket {
  predicate: (result: CriterionFulfillmentResult) => boolean;
  basket: Basket;
  constructor(
    name: string,
    basket: Basket,
    predicate: typeof FulfillmentResultBasket.prototype.predicate,
  ) {
    super(name);
    this.basket = basket;
    this.basket.parentBasket = this;
    this.predicate = predicate;
  }
  static atLeastNMCs(name: string, numMCs: number, basket: Basket) {
    return new FulfillmentResultBasket(
      name,
      basket,
      (result) => result.matchedMCs >= numMCs,
    );
  }

  static atLeastNModules(
    name: string,
    numberOfModules: number,
    basket: Basket,
  ) {
    return new FulfillmentResultBasket(
      name,
      basket,
      (result) => result.matchedModules.size >= numberOfModules,
    );
  }

  childBaskets(): Basket[] {
    return [this.basket];
  }

  isFulfilled(academicPlan: AcademicPlanView): CriterionFulfillmentResult {
    const fulfilled = this.basket.isFulfilledWithState(academicPlan);
    if (!fulfilled.isFulfilled || !this.predicate(fulfilled)) {
      return new CriterionFulfillmentResult(
        false,
        fulfilled.matchedMCs,
        fulfilled.matchedModules,
      );
    } else {
      return fulfilled;
    }
  }

  acceptEvent(event: BasketEvent): void {
    super.acceptEvent(event);
  }
}

export class ModuleBasket extends Basket {
  module: Module;
  constructor(module: Module) {
    super();
    this.module = module;
  }

  isFulfilled(academicPlan: AcademicPlanView): CriterionFulfillmentResult {
    const found = !!academicPlan
      .getModules()
      .find((m) => m.code == this.module.code);

    if (found) {
      this.sendEventUpwards(new CriterionMatchModuleEvent(this.module));
    }

    return found
      ? new CriterionFulfillmentResult(
          true,
          this.module.credits,
          new Set([this.module]),
        )
      : new CriterionFulfillmentResult(false);
  }

  childBaskets(): Basket[] {
    return [];
  }

  acceptEvent(event: BasketEvent): void {
    super.acceptEvent(event);
  }

  doubleCount() {
    this.criterionState.isFulfilled = true;
    this.sendEventUpwards(new DoubleCountModuleEvent(this.module));
  }
}

export class MultiModuleBasket extends Basket {
  moduleCodePattern?: RegExp;
  moduleCodePrefix?: Set<string>;
  moduleCodeSuffix?: Set<string>;
  level?: Set<number>;
  requiredMCs?: number;
  earlyTerminate?: boolean;
  constructor(basket: Partial<MultiModuleBasket>) {
    super();
    this.moduleCodePattern = basket.moduleCodePattern;
    this.moduleCodePrefix = basket.moduleCodePrefix;
    this.moduleCodeSuffix = basket.moduleCodeSuffix;
    this.level = basket.level;
    this.requiredMCs = basket.requiredMCs;
    this.earlyTerminate = basket.earlyTerminate ?? true;
  }

  childBaskets(): Basket[] {
    return [];
  }

  isFulfilled(academicPlan: AcademicPlanView): CriterionFulfillmentResult {
    let filteredModules = academicPlan.getModules().filter((module) => {
      if (this.moduleCodePattern && !this.moduleCodePattern.test(module.code)) {
        return false;
      }

      if (
        this.moduleCodePrefix !== undefined &&
        !this.moduleCodePrefix.has(module.prefix)
      ) {
        return false;
      }

      if (
        this.moduleCodeSuffix !== undefined &&
        !this.moduleCodeSuffix.has(module.suffix)
      ) {
        return false;
      }

      if (this.level !== undefined && !this.level.has(module.level)) {
        return false;
      }

      return true;
    });

    if (this.earlyTerminate && this.requiredMCs !== undefined) {
      // Heuristic: prioritize modules with smaller number of credits
      filteredModules.sort((a, b) => a.credits - b.credits);
      const justEnoughModulesForMCs = [];
      for (
        let i = 0, mcs = 0;
        i < filteredModules.length && mcs < this.requiredMCs;
        i++, mcs += filteredModules[i].credits
      ) {
        justEnoughModulesForMCs.push(filteredModules[i]);
      }
      filteredModules = justEnoughModulesForMCs;
    }

    for (const module of filteredModules) {
      this.sendEventUpwards(new CriterionMatchModuleEvent(module));
    }

    let totalMCs = 0;
    for (const module of filteredModules) {
      totalMCs += module.credits;
    }

    let isFulfilled;
    if (this.requiredMCs === undefined) {
      isFulfilled = true;
    } else {
      isFulfilled = totalMCs >= this.requiredMCs;
    }

    return new CriterionFulfillmentResult(
      isFulfilled,
      totalMCs,
      new Set(filteredModules),
    );
  }
}

export class SemPlan {
  modules: Array<Module>;

  private moduleCodeToModuleMap: Map<string, Module> = new Map();

  constructor(modules: Array<Module>) {
    this.modules = modules;
  }

  preprocess() {
    this.moduleCodeToModuleMap.clear();
    for (const module of this.modules) {
      this.moduleCodeToModuleMap.set(module.code, module);
    }
  }
}

export type SemOnePlan = SemPlan;
export type SemTwoPlan = SemPlan;
export type SpecialTermOnePlan = SemPlan;
export type SpecialTermTwoPlan = SemPlan;

export class AcademicPlanView {
  private academicPlan: AcademicPlan;
  modules: Array<Module>;
  constructor(academicPlan: AcademicPlan, modules: Array<Module>) {
    this.academicPlan = academicPlan;
    this.modules = modules;
  }

  getModules() {
    return this.modules;
  }

  withModules(modules: Array<Module>): AcademicPlanView {
    return new AcademicPlanView(this.academicPlan, modules);
  }

  withModulesFilteredBy(filter: Filter): AcademicPlanView {
    return this.withModules(this.modules.filter(filter.getFilter()));
  }

  withOriginalPlan(): AcademicPlanView {
    return new AcademicPlanView(
      this.academicPlan,
      this.academicPlan.getModules(),
    );
  }
}

export class AcademicPlan {
  plans: Array<
    [SemOnePlan, SemTwoPlan, SpecialTermOnePlan, SpecialTermTwoPlan]
  >;

  private modules: Array<Module> = [];
  private moduleCodeToModuleMap: Map<string, Module> = new Map();

  constructor(numYears: number) {
    this.plans = new Array(numYears);
    for (let i = 0; i < numYears; i++) {
      this.plans[i] = [
        new SemPlan([]),
        new SemPlan([]),
        new SemPlan([]),
        new SemPlan([]),
      ];
    }
  }

  preprocess() {
    this.modules = [];
    this.moduleCodeToModuleMap.clear();
    for (const plan of this.plans) {
      for (const module of plan.flatMap((semPlan) => semPlan.modules)) {
        this.modules.push(module);
        this.moduleCodeToModuleMap.set(module.code, module);
      }
    }
  }

  getPlanView(): AcademicPlanView {
    this.preprocess();
    return new AcademicPlanView(this, this.modules);
  }

  getModules() {
    return this.modules;
  }

  resetState() {
    this.modules.forEach((module) => module.resetState());
  }

  checkAgainstConfig(config: input.ConvertedConfig) {
    for (const [k, v] of config.doubleCountedModules) {
      if (this.getPlanView().modules.find((m) => m.code === k) === undefined) {
        continue;
      }

      for (const basket of v) {
        basket.doubleCount();
      }
    }

    return this.checkAgainstBasket(config.basket);
  }

  checkAgainstBasket(basket: Basket): boolean {
    return basket.isFulfilledWithState(this.getPlanView()).isFulfilled;
  }
}

/**
 * With specialization in operations research and applied mathematics
 */
function testAppliedMathsPlan() {
  // Level 1000
  const ma1100 = new Module("MA1100", "", 4);
  const ma1100t = new Module("MA1100T", "", 4);
  const cs1231 = new Module("CS1231", "", 4);
  const cs1231s = new Module("CS1231S", "", 4);
  const ma1101r = new Module("MA1101R", "", 4);
  const ma2001 = new Module("MA2001", "", 4);
  const ma1102r = new Module("MA1102R", "", 4);
  const ma2002 = new Module("MA2002", "", 4);
  const cs1010 = new Module("CS1010", "", 4);
  const cs1010e = new Module("CS1010E", "", 4);
  const cs1010s = new Module("CS1010S", "", 4);
  const cs1010x = new Module("CS1010X", "", 4);
  const cs1101s = new Module("CS1101S", "", 4);

  // Level 2000
  const ma2101 = new Module("MA2101", "", 4);
  const ma2101s = new Module("MA2101S", "", 5);
  const ma2104 = new Module("MA2104", "", 4);
  const ma2108 = new Module("MA2108", "", 4);
  const ma2108s = new Module("MA2108S", "", 5);
  const ma2213 = new Module("MA2213", "", 4);
  const ma2216 = new Module("MA2216", "", 4);
  const ma2116 = new Module("MA2116", "", 4);
  const st2131 = new Module("ST2131", "", 4);

  // Level 3000

  // Level 4000
  const ma4199 = new Module("MA4199", "", 12);

  // List II
  const pc2130 = new Module("PC2130", "", 4);
  const pc2132 = new Module("PC2132", "", 4);
  const st2132 = new Module("ST2132", "", 4);
  const ec2101 = new Module("EC2101", "", 4);

  // List III
  const bse3703 = new Module("BSE3703", "", 4);
  const cs3230 = new Module("CS3230", "", 4);
  const cs3231 = new Module("CS3231", "", 4);
  const cs3234 = new Module("CS3234", "", 4);
  const dsa3102 = new Module("DSA3102", "", 4);
  const ec3101 = new Module("EC3103", "", 4);
  const ec3303 = new Module("EC3303", "", 4);
  const pc3130 = new Module("PC3130", "", 4);
  const pc3236 = new Module("PC3236", "", 4);
  const pc3238 = new Module("PC3238", "", 4);
  const st3131 = new Module("ST3131", "", 4);
  const st3236 = new Module("ST3236", "", 4);

  // AM3A
  const ma3220 = new Module("MA3220", "", 4);
  const ma3227 = new Module("MA3227", "", 4);
  const ma3233 = new Module("MA3233", "", 4);
  const ma3264 = new Module("MA3264", "", 4);
  // st3131 as well

  // AM3B
  const ma3236 = new Module("MA3236", "", 4);
  const ma3238 = new Module("MA3238", "", 4); // this one has an alternative module code ST3236
  const ma3252 = new Module("MA3252", "", 4);
  const ma3269 = new Module("MA3269", "", 4);
  // st3131 as well

  // AM4A
  const ma4229 = new Module("MA4299", "", 4);
  const ma4230 = new Module("MA4230", "", 4);
  const ma4255 = new Module("MA4255", "", 4);
  const ma4261 = new Module("MA4261", "", 4);
  const ma4268 = new Module("MA4268", "", 4);
  const ma4270 = new Module("MA4270", "", 4);

  // AM4B
  const ma4235 = new Module("MA4235", "", 4);
  const ma4254 = new Module("MA4254", "", 4);
  const ma4260 = new Module("MA4260", "", 4);
  const ma4264 = new Module("MA4264", "", 4);
  const ma4269 = new Module("MA4269", "", 4);
  const qf4103 = new Module("QF4103", "", 4);
  const st4245 = new Module("ST4245", "", 4);

  const academicPlan = new AcademicPlan(4);
  const listIIBasket = new StatefulBasket(
    ArrayBasket.or("list 2", [
      new ModuleBasket(pc2130),
      new ModuleBasket(pc2132),
      new ModuleBasket(st2132),
      new ModuleBasket(ec2101),
    ]),
  );

  const listIIIBasket = ArrayBasket.or("list 3", [
    new ModuleBasket(bse3703),
    new ModuleBasket(cs3230),
    new ModuleBasket(cs3231),
    new ModuleBasket(cs3234),
    new ModuleBasket(dsa3102),
    new ModuleBasket(ec3101),
    new ModuleBasket(ec3303),
    new ModuleBasket(pc3130),
    new ModuleBasket(pc3236),
    new ModuleBasket(pc3238),
    new ModuleBasket(st3131),
    new ModuleBasket(st3236),
  ]);

  const listIVBasket = ArrayBasket.or("list 4", []);

  const am3ABasket = ArrayBasket.or("AM3A", [
    new ModuleBasket(ma3220),
    new ModuleBasket(ma3227),
    new ModuleBasket(ma3233),
    new ModuleBasket(ma3264),
    new ModuleBasket(st3131),
  ]);

  const am3BBasket = ArrayBasket.or("AM3B", [
    new ModuleBasket(ma3236),
    new ModuleBasket(ma3238),
    new ModuleBasket(ma3252),
    new ModuleBasket(ma3269),
    new ModuleBasket(st3131),
  ]);

  const am3Basket = ArrayBasket.or("AM3", [am3ABasket, am3BBasket]);

  const am4ABasket = ArrayBasket.or("AM4A", [
    new ModuleBasket(ma4229),
    new ModuleBasket(ma4230),
    new ModuleBasket(ma4255),
    new ModuleBasket(ma4261),
    new ModuleBasket(ma4268),
    new ModuleBasket(ma4270),
  ]);

  const am4BBasket = ArrayBasket.or("AM4B", [
    new ModuleBasket(ma4235),
    new ModuleBasket(ma4254),
    new ModuleBasket(ma4260),
    new ModuleBasket(ma4261),
    new ModuleBasket(ma4268),
    new ModuleBasket(ma4270),
  ]);

  const am4Basket = ArrayBasket.or("AM4", [am4ABasket, am4BBasket]);

  const listState = new BasketState(
    new Set(
      [
        ma2101,
        ma2101s,
        ma2104,
        ma2108,
        ma2108s,
        ma2213,
        ma2216,
        ma2116,
        st2131,
      ].map((mod) => mod.code),
    ),
  );
  const am3State = new BasketState();
  const am4State = new BasketState();

  const level1000Basket = ArrayBasket.and("Level 1000", [
    ArrayBasket.or("", [
      new ModuleBasket(ma1100),
      new ModuleBasket(ma1100t),
      new ModuleBasket(cs1231),
      new ModuleBasket(cs1231s),
    ]),
    ArrayBasket.or("", [new ModuleBasket(ma1101r), new ModuleBasket(ma2001)]),
    ArrayBasket.or("", [new ModuleBasket(ma1102r), new ModuleBasket(ma2002)]),
    ArrayBasket.or("", [
      new ModuleBasket(cs1010),
      new ModuleBasket(cs1010e),
      new ModuleBasket(cs1010s),
      new ModuleBasket(cs1010x),
      new ModuleBasket(cs1101s),
    ]),
  ]);

  // The last part of the level 2000 basket is "Pass one additional mod from List II, III, IV"
  const level2000Basket = ArrayBasket.and("", [
    ArrayBasket.or("", [new ModuleBasket(ma2101), new ModuleBasket(ma2101s)]),
    new ModuleBasket(ma2104),
    ArrayBasket.or("", [new ModuleBasket(ma2108), new ModuleBasket(ma2108s)]),
    new ModuleBasket(ma2213),
    ArrayBasket.or("", [
      new ModuleBasket(ma2216),
      new ModuleBasket(ma2116),
      new ModuleBasket(st2131),
    ]),
    ArrayBasket.or("Lists 2 to 4", [
      new StatefulBasket(listIIBasket, listState),
      new StatefulBasket(listIIIBasket, listState),
      new StatefulBasket(listIVBasket, listState),
    ]),
  ]);

  const level3000Basket = ArrayBasket.and("Level 3000", [
    new StatefulBasket(am3BBasket, am3State),
    new StatefulBasket(am3Basket, am3State),
    new StatefulBasket(am3Basket, am3State),
    ArrayBasket.or("Lists 3 to 4", [
      new StatefulBasket(listIIIBasket, listState),
      new StatefulBasket(listIVBasket, listState),
    ]),
  ]);

  const level4000Basket = ArrayBasket.and("Level 4000", [
    new ModuleBasket(ma4199),
    new StatefulBasket(am4Basket, am4State),
    new StatefulBasket(am4Basket, am4State),
    new StatefulBasket(am4Basket, am4State),
    new StatefulBasket(am4Basket, am4State),
    new StatefulBasket(listIVBasket, listState),
  ]);

  const appliedMathBasket = ArrayBasket.and("Applied Maths", [
    level1000Basket,
    level2000Basket,
    level3000Basket,
    level4000Basket,
  ]);

  const myAcademicPlan = new AcademicPlan(4);
  const cs2030 = new Module("CS2030", "", 4);
  const cs2040 = new Module("CS2040", "", 4);
  const cfg1002 = new Module("CFG1002", "", 4);
  const es2660 = new Module("ES2660", "", 4);
  const get1031 = new Module("GET1031", "", 4);
  const pc1141 = new Module("PC1141", "", 4);
  academicPlan.plans[0][0].modules.push(
    cs1010x,
    cs2030,
    cs2040,
    cfg1002,
    cs1231s,
    es2660,
    get1031,
    ma1101r,
    ma1102r,
    pc1141,
  );

  const cs2100 = new Module("CS2100", "", 4);
  const geq1000 = new Module("GEQ1000", "", 4);
  const ger1000 = new Module("GER1000", "", 4);
  const is1103 = new Module("IS1103", "", 4);

  academicPlan.plans[0][1].modules.push(
    cs2100,
    geq1000,
    ger1000,
    is1103,
    ma2101,
    ma2104,
    ma2108s,
    st2131,
  );

  const cs2101 = new Module("CS2101", "", 4);
  const cs2103t = new Module("CS2103T", "", 4);
  const cs2106 = new Module("CS2106", "", 4);
  const geh1036 = new Module("GEH1036", "", 4);
  const ma2202 = new Module("MA2202", "", 4);
  const ma3210 = new Module("MA3210", "", 4);
  academicPlan.plans[1][0].modules.push(
    cs2101,
    cs2103t,
    cs2106,
    cs3230,
    cs3231,
    geh1036,
    ma2202,
    ma3210,
  );

  const cs2105 = new Module("CS2105", "", 4);
  const cs3217 = new Module("CS3217", "", 5);
  const cs4231 = new Module("CS4231", "", 4);
  const fms1212p = new Module("FMS1212P", "", 4);
  academicPlan.plans[1][1].modules.push(
    cs2105,
    cs3217,
    cs4231,
    fms1212p,
    ma3238,
    ma3252,
    st2132,
  );
  academicPlan.checkAgainstBasket(appliedMathBasket);
  log.log(appliedMathBasket);
}

function testCS2019Plan(useRequirementsJSONOrYAML: boolean = false) {
  // ULR
  const gehxxxx = new Module("GEH0000", "", 4);
  const geqxxxx = new Module("GEQ1000", "", 4);
  const gerxxxx = new Module("GER1000", "", 4);
  const gesxxxx = new Module("GES0000", "", 4);
  const getxxxx = new Module("GET0000", "", 4);

  const ulrBasket = ArrayBasket.and("General Education", [
    new ModuleBasket(gehxxxx),
    new ModuleBasket(geqxxxx),
    new ModuleBasket(gerxxxx),
    new ModuleBasket(gesxxxx),
    new ModuleBasket(getxxxx),
  ]);

  const ueBasket = new MultiModuleBasket({
    moduleCodePattern: /./,
    requiredMCs: 32,
    earlyTerminate: false,
  });

  // CS Foundation
  const cs1101s = new Module("CS1101S", "", 4);
  const cs1010x = new Module("CS1010X", "", 4);
  const cs1231s = new Module("CS1231S", "", 4);
  const cs2030s = new Module("CS2030S", "", 4);
  const cs2040s = new Module("CS2040S", "", 4);
  const cs2100 = new Module("CS2100", "", 4);
  const cs2103t = new Module("CS2103T", "", 4);
  const cs2105 = new Module("CS2105", "", 4);
  const cs2106 = new Module("CS2106", "", 4);
  const cs3230 = new Module("CS3230", "", 4);
  const foundation_cs2103tBasket = new ModuleBasket(cs2103t);
  const csFoundationBasket = ArrayBasket.and("CS Foundation", [
    ArrayBasket.or("Programming Methodology", [
      new ModuleBasket(cs1101s),
      new ModuleBasket(cs1010x),
    ]),
    ArrayBasket.and("", [
      new ModuleBasket(cs1231s),
      new ModuleBasket(cs2030s),
      new ModuleBasket(cs2040s),
      new ModuleBasket(cs2100),
      foundation_cs2103tBasket,
      new ModuleBasket(cs2105),
      new ModuleBasket(cs2106),
      new ModuleBasket(cs3230),
    ]),
  ]);

  // CS breadth & depth
  /**
   * Satisfy at least one CS Focus Area for BComp(CS) by completing 3 modules in the Area Primaries, with at least one module at level-4000 or above.
   * Computer Science Foundation modules that appear in Area Primaries can be counted as one of the 3 modules towards satisfying a Focus Area.
   * At least 12 MCs are at level-4000 or above.
   */

  // CS team project
  const cs3216 = new Module("CS3216", "", 5);
  const cs3217 = new Module("CS3217", "", 5);
  const cs3281 = new Module("CS3281", "", 4);
  const cs3282 = new Module("CS3282", "", 4);
  const cs3203 = new Module("CS3203", "", 8);

  const csTeamProjectBasket = ArrayBasket.or("CS Team Project", [
    new ModuleBasket(cs3203),
    ArrayBasket.and("CS3216/17 combo", [
      new ModuleBasket(cs3216),
      new ModuleBasket(cs3217),
    ]),
    ArrayBasket.and("CS3281/82 combo", [
      new ModuleBasket(cs3281),
      new ModuleBasket(cs3282),
    ]),
  ]);

  // IT professionalism
  const is1103 = new Module("IS1103", "", 4);
  const is1108 = new Module("IS1108", "", 4);
  const cs2101 = new Module("CS2101", "", 4);
  const es2660 = new Module("ES2660", "", 4);

  const csItProfessionalismBasket = ArrayBasket.and("CS IT Professionalism", [
    ArrayBasket.or("", [new ModuleBasket(is1103), new ModuleBasket(is1108)]),
    new ModuleBasket(cs2101),
    new ModuleBasket(es2660),
  ]);

  // industry exp
  const cp3880 = new Module("CP3880", "", 12);
  const cp3200 = new Module("CP3200", "", 6);
  const cp3202 = new Module("CP3202", "", 6);
  const cp3107 = new Module("CP3107", "", 6);
  const cp3110 = new Module("CP3110", "", 6);
  const is4010 = new Module("IS4010", "", 12);
  const tr3203 = new Module("TR3202", "", 12);

  const csIndustryExpBasket = ArrayBasket.or("CS Industry Experience", [
    new ModuleBasket(cp3880),
    ArrayBasket.and("", [new ModuleBasket(cp3200), new ModuleBasket(cp3202)]),
    ArrayBasket.and("", [new ModuleBasket(cp3107), new ModuleBasket(cp3110)]),
    new ModuleBasket(is4010),
    new ModuleBasket(tr3203),
  ]);

  // math
  const ma1101r = new Module("MA1101R", "", 4);
  const ma1521 = new Module("MA1521", "", 4);
  const st2131 = new Module("ST2131", "", 4);
  const st2132 = new Module("ST2132", "", 4);
  const st2334 = new Module("ST2334", "", 4);

  // sci mods
  // TODO: Fill this list up
  const pc1221 = new Module("PC1221", "", 4);

  const csMathAndSciBasket = ArrayBasket.and("Math and Sci", [
    ArrayBasket.or("Statistics", [
      ArrayBasket.and("", [new ModuleBasket(st2131), new ModuleBasket(st2132)]),
      new ModuleBasket(st2334),
    ]),
    new ModuleBasket(ma1101r),
    new ModuleBasket(ma1521),
    ArrayBasket.or("", [new ModuleBasket(pc1221)]),
  ]);

  // SWE Focus Area
  const cs3213 = new Module("CS3213", "", 4);
  const cs3219 = new Module("CS3219", "", 4);
  const cs4211 = new Module("CS4211", "", 4);
  const cs4218 = new Module("CS4218", "", 4);
  const cs4239 = new Module("CS4239", "", 4);
  const csSWEFABasketState = new BasketState();

  // This probably needs to be a stateful basket or something to prevent doublecounting?
  const swe_cs2103tBasket = new ModuleBasket(cs2103t);
  const csSWEFocusAreaPrimaries = FulfillmentResultBasket.atLeastNModules(
    "SWE FA",
    3,
    ArrayBasket.and("", [
      new StatefulBasket(
        ArrayBasket.atLeastN("SWE FA at least 1 Level 4000", 1, [
          new ModuleBasket(cs4211),
          new ModuleBasket(cs4218),
          new ModuleBasket(cs4239),
        ]),
        csSWEFABasketState,
      ),
      new StatefulBasket(
        ArrayBasket.atLeastN("SWE FA at least 2 others", 2, [
          swe_cs2103tBasket,
          new ModuleBasket(cs3213),
          new ModuleBasket(cs3219),
          new ModuleBasket(cs4211),
          new ModuleBasket(cs4218),
          new ModuleBasket(cs4239),
        ]),
        csSWEFABasketState,
      ),
    ]),
  );

  // Algos Focus Area
  const cs3231 = new Module("CS3231", "", 4);
  const cs3236 = new Module("CS3236", "", 4);
  const cs4231 = new Module("CS4231", "", 4);
  const cs4232 = new Module("CS4232", "", 4);
  const cs4234 = new Module("CS4234", "", 4);
  const csAlgosFABasketState = new BasketState();

  const csAlgosFocusAreaPrimaries = ArrayBasket.atLeastN("Algo FA", 3, [
    new StatefulBasket(
      ArrayBasket.atLeastN("Level 4000", 1, [
        new ModuleBasket(cs4231),
        new ModuleBasket(cs4232),
        new ModuleBasket(cs4234),
      ]),
      csAlgosFABasketState,
    ),
    new StatefulBasket(
      ArrayBasket.atLeastN("", 2, [
        new ModuleBasket(cs3230),
        new ModuleBasket(cs3231),
        new ModuleBasket(cs3236),
        new ModuleBasket(cs4231),
        new ModuleBasket(cs4232),
        new ModuleBasket(cs4234),
      ]),
      csAlgosFABasketState,
    ),
  ]);

  // AI Focus Area
  const cs2109s = new Module("CS2109S", "", 4);
  const cs3243 = new Module("CS3243", "", 4);
  const cs3244 = new Module("CS3244", "", 4);
  const cs3263 = new Module("CS3263", "", 4);
  const cs3264 = new Module("CS3264", "", 4);
  const cs4243 = new Module("CS4243", "", 4);
  const cs4244 = new Module("CS4244", "", 4);
  const cs4246 = new Module("CS4246", "", 4);
  const cs4248 = new Module("CS4248", "", 4);
  const csAIFABasketState = new BasketState();

  const csAIFocusAreaPrimaries = ArrayBasket.atLeastN("AI FA", 3, [
    new StatefulBasket(
      ArrayBasket.atLeastN("", 1, [
        new ModuleBasket(cs4243),
        new ModuleBasket(cs4244),
        new ModuleBasket(cs4246),
        new ModuleBasket(cs4248),
      ]),
      csAIFABasketState,
    ),
    new StatefulBasket(
      ArrayBasket.atLeastN("", 2, [
        new ModuleBasket(cs2109s),
        new ModuleBasket(cs3243),
        new ModuleBasket(cs3244),
        new ModuleBasket(cs3263),
        new ModuleBasket(cs3264),
        new ModuleBasket(cs4243),
        new ModuleBasket(cs4244),
        new ModuleBasket(cs4246),
        new ModuleBasket(cs4248),
      ]),
      csAIFABasketState,
    ),
  ]);

  // TODO: How to satify 24MC requirement? should we throw all the the focus area mods into another giant NOf(3) basket?
  // e.g csbreadthAndDepth = new AndBasket(new NOfBasket(1, [all focus area primaries]), new NOfBasket(3, [all focus area mods]))
  const csBreadthAndDepthState = new BasketState();
  const csBreadthAndDepthBasket = FulfillmentResultBasket.atLeastNMCs(
    "Breadth and Depth",
    24,
    ArrayBasket.and("", [
      new StatefulBasket(
        ArrayBasket.or("", [
          csSWEFocusAreaPrimaries,
          // csAlgosFocusAreaPrimaries,
          // csAIFocusAreaPrimaries,
          /* other focus area primaries */
        ]),
        csBreadthAndDepthState,
      ),
      new StatefulBasket(
        new MultiModuleBasket({
          moduleCodePrefix: new Set(["CS"]),
          requiredMCs: 4,
          earlyTerminate: false,
        }),
        /* All CS coded modules */ csBreadthAndDepthState,
      ),
    ]),
  );

  const overallDegreeState = new BasketState();
  const csDegree = ArrayBasket.and("CS Degree", [
    new StatefulBasket(ulrBasket, overallDegreeState),
    new StatefulBasket(csFoundationBasket, overallDegreeState),
    new StatefulBasket(csTeamProjectBasket, overallDegreeState),
    new StatefulBasket(csIndustryExpBasket, overallDegreeState),
    new StatefulBasket(csItProfessionalismBasket, overallDegreeState),
    new StatefulBasket(csBreadthAndDepthBasket, overallDegreeState),
    new StatefulBasket(csMathAndSciBasket, overallDegreeState),
    new StatefulBasket(ueBasket, overallDegreeState),
  ]);

  let config: input.ConvertedConfig;
  if (useRequirementsJSONOrYAML) {
    config = input.testLoadRequirements();
  } else {
    config = new input.ConvertedConfig();
    config.basket = csDegree;
    config.doubleCountedModules = new Map();
    config.doubleCountedModules.set("CS2103T", [
      foundation_cs2103tBasket,
      swe_cs2103tBasket,
    ]);
  }
  const academicPlan = new AcademicPlan(4);
  // Dummy UE
  const ue1 = new Module("UE0001", "", 4);
  const ue2 = new Module("UE0002", "", 4);
  const ue3 = new Module("UE0003", "", 4);
  const ue4 = new Module("UE0004", "", 4);
  const ue5 = new Module("UE0005", "", 4);
  const ue6 = new Module("UE0006", "", 4);
  const ue7 = new Module("UE0007", "", 4);
  const ue8 = new Module("UE0008", "", 4);
  const ue9 = new Module("UE0009", "", 4);

  academicPlan.plans[0][0].modules.push(
    cs1101s,
    es2660,
    is1103,
    getxxxx,
    gerxxxx,
    pc1221,
  );

  academicPlan.plans[0][1].modules.push(
    cs1231s,
    cs2100,
    cs2030s,
    ma1101r,
    gehxxxx,
  );

  const cs2107 = new Module("CS2107", "", 4);
  academicPlan.plans[1][0].modules.push(
    cs2040s,
    cs2106,
    cs2107,
    ma1521,
    geqxxxx,
  );

  academicPlan.plans[1][1].modules.push(
    cs2103t,
    cs2105,
    st2334,
    cs2101,
    gesxxxx,
  );

  const cs3235 = new Module("CS3235", "", 4);
  const cs3103 = new Module("CS3103", "", 4);
  const it2900 = new Module("IT2900", "", 4);
  const uit2201 = new Module("UIT2201", "", 4);
  academicPlan.plans[2][0].modules.push(
    cs3235,
    cs3219,
    cs3103,
    it2900,
    uit2201,
  );

  const cs4222 = new Module("CS4222", "", 4);
  const cs5321 = new Module("CS5321", "", 4);
  academicPlan.plans[2][1].modules.push(cs4218, cs3230, cs5321, cs4222);

  academicPlan.plans[3][0].modules.push(cs3216, ue2, ue3, ue4, ue5);
  academicPlan.plans[3][1].modules.push(
    cs3217,
    ue6,
    ue7,
    ue8,
    ue9,
    cp3200,
    cp3202,
  );

  const result = academicPlan.checkAgainstConfig(config);
  // log.log(result);
  // log.log(csDegree);
  log.log(config.basket.getPrintableClone(7));
}

// testCS2019Plan(false);

function testCHSEconsPlan(useRequirementsJSONOrYAML: boolean = false) {
  // CHS Common Curriculum = {Common core, Integrated, Interdisci}
  // AI
  const cs2109s = new Module("CS2109S", "", 4);
  const hs1501 = new Module("HS1501", "", 4);
  const it1224 = new Module("IT1224", "", 4);
  const ccAIBasket = ArrayBasket.or("Common Core - AI", [
    new ModuleBasket(cs2109s),
    new ModuleBasket(hs1501),
    new ModuleBasket(it1224),
  ]);

  // Communities & Engagement
  // There's too many, using a placeholder mod
  const ceXXXX = new Module("CE0000", "", 4);
  const ccCEBasket = new ModuleBasket(ceXXXX);

  // Digital literacy
  const gei1001 = new Module("GEI1001", "", 4);
  const gei1002 = new Module("GEI1002", "", 4);
  const nm2207 = new Module("NM2207", "", 4);
  const ccDigLBasket = ArrayBasket.or("Common Core - Digital Literacy", [
    new ModuleBasket(gei1001),
    new ModuleBasket(gei1002),
    new ModuleBasket(nm2207),
  ]);

  // Design thinking
  const dtk1234 = new Module("DTK1234", "", 4);
  const ccDTKBasket = new ModuleBasket(dtk1234);

  // Data literacy
  const bt1101 = new Module("BT1101", "", 4);
  const dsa1101 = new Module("DSA1101", "", 4);
  const dse1101 = new Module("DSE1101", "", 4);
  const gra1000 = new Module("GRA1000", "", 4);
  const st1131 = new Module("ST1131", "", 4);
  const ccDatLBasket = ArrayBasket.or("Common Core - Data Literacy", [
    new ModuleBasket(bt1101),
    new ModuleBasket(dsa1101),
    new ModuleBasket(dse1101),
    new ModuleBasket(gra1000),
    new ModuleBasket(st1131),
  ]);

  // Writing
  const sp1541 = new Module("SP1541", "", 4);
  const sp2271 = new Module("SP2271", "", 4);
  const fas1101 = new Module("FAS1101", "", 4);
  const ccWritingBasket = ArrayBasket.or("Common Core - Writing", [
    new ModuleBasket(sp1541),
    new ModuleBasket(sp2271),
    new ModuleBasket(fas1101),
  ]);

  const commonCoreBasket = ArrayBasket.and("Common Core", [
    ccAIBasket,
    ccCEBasket,
    ccDigLBasket,
    ccDTKBasket,
    ccDatLBasket,
    ccWritingBasket,
  ]);

  // Integrated
  // Asian studies
  const hsa1000 = new Module("HSA1000", "", 4);
  const intAsianStudiesBasket = new ModuleBasket(hsa1000);

  // Humanities
  const hsh1000 = new Module("HSH1000", "", 4);
  const intHumanitiesBasket = new ModuleBasket(hsh1000);

  // Scientific Inquiry 1
  const hsi1000 = new Module("HSI1000", "", 4);
  const sp2274 = new Module("SP2274", "", 4);
  const intSciOneBasket = ArrayBasket.or("Integrated - Sci Inq I", [
    new ModuleBasket(hsi1000),
    new ModuleBasket(sp2274),
  ]);

  // Scientific Inquiry 2
  const hsi2001 = new Module("HSI2001", "", 4);
  const hsi2002 = new Module("HSI2002", "", 4);
  const hsi2003 = new Module("HSI2003", "", 4);
  const hsi2004 = new Module("HSI2004", "", 4);
  const hsi2005 = new Module("HSI2005", "", 4);
  const hsi2006 = new Module("HSI2006", "", 4);
  const hsi2007 = new Module("HSI2007", "", 4);
  const hsi2008 = new Module("HSI2008", "", 4);
  const hsi2009 = new Module("HSI2009", "", 4);
  const hsi2010 = new Module("HSI2010", "", 4);
  const hsi2011 = new Module("HSI2011", "", 4);
  const hsi2012 = new Module("HSI2012", "", 4);
  const hsi2013 = new Module("HSI2013", "", 4);
  const hsi2014 = new Module("HSI2014", "", 4);
  const sp3275 = new Module("HSI2014", "", 4);

  const intSciTwoBasket = ArrayBasket.or("Integrated - Sci Inq II", [
    new ModuleBasket(hsi2001),
    new ModuleBasket(hsi2002),
    new ModuleBasket(hsi2003),
    new ModuleBasket(hsi2004),
    new ModuleBasket(hsi2005),
    new ModuleBasket(hsi2006),
    new ModuleBasket(hsi2007),
    new ModuleBasket(hsi2008),
    new ModuleBasket(hsi2009),
    new ModuleBasket(hsi2010),
    new ModuleBasket(hsi2011),
    new ModuleBasket(hsi2012),
    new ModuleBasket(hsi2013),
    new ModuleBasket(hsi2014),
    new ModuleBasket(sp3275),
  ]);

  // Social Science
  const hss1000 = new Module("HSS1000", "", 4);
  const intSSBasket = new ModuleBasket(hss1000);

  const integratedBasket = ArrayBasket.and("Integrated", [
    intAsianStudiesBasket,
    intHumanitiesBasket,
    intSciOneBasket,
    intSciTwoBasket,
    intSSBasket,
  ]);

  // ID 1 & 2
  const hs2902 = new Module("HS2902", "", 4);
  const hs2903 = new Module("HS2903", "", 4);
  const hs2904 = new Module("HS2904", "", 4);
  const hs2905 = new Module("HS2905", "", 4);
  const hs2906 = new Module("HS2906", "", 4);
  const hs2907 = new Module("HS2907", "", 4);
  const interdisciplinaryBasket = ArrayBasket.atLeastN("Interdisciplinary", 2, [
    new ModuleBasket(hs2902),
    new ModuleBasket(hs2903),
    new ModuleBasket(hs2904),
    new ModuleBasket(hs2905),
    new ModuleBasket(hs2906),
    new ModuleBasket(hs2907),
  ]);

  const chsCommonCore = ArrayBasket.and("CHS Common Core", [
    commonCoreBasket,
    integratedBasket,
    interdisciplinaryBasket,
  ]);

  // Econs Baseline
  const ec1101e = new Module("EC1101E", "", 4);
  const ec2101 = new Module("EC2101", "", 4);
  const ec2102 = new Module("EC2102", "", 4);
  const ec2104 = new Module("EC2104", "", 4);
  const ec2303 = new Module("EC2303", "", 4);
  const ec3101 = new Module("EC3101", "", 4);
  const ec3102 = new Module("EC3102", "", 4);
  const ec3303 = new Module("EC3303", "", 4);
  const econsFoundationBasket = ArrayBasket.and("Econs Foundation", [
    new ModuleBasket(ec1101e),
    new ModuleBasket(ec2101),
    new ModuleBasket(ec2102),
    new ModuleBasket(ec2104),
    new ModuleBasket(ec2303),
    new ModuleBasket(ec3101),
    new ModuleBasket(ec3102),
    new ModuleBasket(ec3303),
  ]);

  const econs3kreq = new MultiModuleBasket({
    moduleCodePrefix: new Set(["EC"]),
    requiredMCs: 4,
    earlyTerminate: false,
  });

  const econs4kreq = new MultiModuleBasket({
    moduleCodePrefix: new Set(["EC"]),
    requiredMCs: 20,
    earlyTerminate: false,
  });

  const econsMajorBasket = ArrayBasket.and("Econs Major", [
    econsFoundationBasket,
    econs3kreq,
    econs4kreq,
  ]);

  const ueBasket = new MultiModuleBasket({
    moduleCodePattern: /./,
    requiredMCs: 48,
    earlyTerminate: false,
  });

  const econsDegree = ArrayBasket.and("Econs degree", [
    chsCommonCore,
    econsMajorBasket,
    ueBasket,
  ]);
}

export {};
