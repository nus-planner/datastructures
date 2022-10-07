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

const moduleRegex = /[A-Z]+(?<codeNumber>\d)\d+[A-Z]*/;

export class ModuleState {
  matchedBaskets: Array<Basket> = [];
}
export class Module {
  state: ModuleState = new ModuleState();
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
    return this.set.has(module[this.propertyName]);
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
}

class CriterionState {
  lastResult: CriterionFulfillmentResult = new CriterionFulfillmentResult();
}

abstract class BasketEvent {}

class CriterionMatchModuleEvent extends BasketEvent {
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
  criterionState: CriterionState;
  eventDelegate?: CriterionEventDelegate;
  isFulfilled(academicPlan: AcademicPlanView): CriterionFulfillmentResult;
}

/**
 * A Basket is a collection of modules. In particular, a Basket can contain a single module
 */

export abstract class Basket implements Criterion, CriterionEventDelegate {
  criterionState: CriterionState = new CriterionState();
  parentBasket?: Basket;

  abstract isFulfilled(
    academicPlan: AcademicPlanView,
  ): CriterionFulfillmentResult;

  isFulfilledWithState(
    academicPlan: AcademicPlanView,
  ): CriterionFulfillmentResult {
    const fulfilled = this.isFulfilled(academicPlan);
    this.criterionState.lastResult = fulfilled;
    return fulfilled;
  }

  abstract childBaskets(): Array<Basket>;

  resetSubtreeState() {
    this.criterionState = new CriterionState();
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
    }
  }
}

class BasketState {
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
    baskets: Array<Basket>,
    binaryOp: BinaryOp,
    n: number,
    earlyTerminate: boolean,
  ) {
    super();
    this.baskets = baskets;
    this.baskets.forEach((basket) => (basket.parentBasket = this));
    this.binaryOp = binaryOp;
    this.n = n;
    this.earlyTerminate = earlyTerminate;
  }

  static or(baskets: Array<Basket>): ArrayBasket {
    return new ArrayBasket(baskets, BinaryOp.GEQ, 1, true);
  }

  static and(baskets: Array<Basket>): ArrayBasket {
    return new ArrayBasket(baskets, BinaryOp.GEQ, baskets.length, false);
  }

  static atLeastN(n: number, basket: Array<Basket>): ArrayBasket {
    return new ArrayBasket(basket, BinaryOp.GEQ, n, true);
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
      case BinaryOp.GT:
        toMatch = this.n + 1;
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
      totalMCs += basket.criterionState.lastResult.matchedMCs;
      for (const module of basket.criterionState.lastResult.matchedModules) {
        allMatchedModules.add(module);
      }
    }

    return fulfilled
      ? new CriterionFulfillmentResult(true, totalMCs, allMatchedModules)
      : new CriterionFulfillmentResult(false);
  }
  acceptEvent(event: BasketEvent): void {
    console.log("Nothing is done so far.");
  }
}

export class FulfillmentResultBasket extends Basket {
  predicate: (result: CriterionFulfillmentResult) => boolean;
  basket: Basket;
  constructor(
    basket: Basket,
    predicate: typeof FulfillmentResultBasket.prototype.predicate,
  ) {
    super();
    this.basket = basket;
    this.basket.parentBasket = this;
    this.predicate = predicate;
  }
  static atLeastNMCs(numMCs: number, basket: Basket) {
    return new FulfillmentResultBasket(
      basket,
      (result) => result.matchedMCs > numMCs,
    );
  }

  childBaskets(): Basket[] {
    return [this.basket];
  }

  isFulfilled(academicPlan: AcademicPlanView): CriterionFulfillmentResult {
    const fulfilled = this.basket.isFulfilled(academicPlan);
    if (!fulfilled.isFulfilled || !this.predicate(fulfilled)) {
      return new CriterionFulfillmentResult(false);
    } else {
      return fulfilled;
    }
  }

  acceptEvent(event: BasketEvent): void {
    console.log("Nothing is done so far.");
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

    this.sendEventUpwards(new CriterionMatchModuleEvent(this.module));
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
    console.log("Nothing is done so far.");
  }
}

export class MultiModuleBasket extends Basket {
  moduleCodePattern?: RegExp;
  moduleCodePrefix?: Set<string>;
  moudleCodeSuffix?: Set<string>;
  level?: Set<1000 | 2000 | 3000 | 4000 | 5000 | 6000>;
  requiredMCs?: number;
  constructor(basket: Partial<MultiModuleBasket>) {
    super();
    this.moduleCodePattern = basket.moduleCodePattern;
    this.moduleCodePrefix = basket.moduleCodePrefix;
    this.moudleCodeSuffix = basket.moudleCodeSuffix;
    this.level = basket.level;
    this.requiredMCs = basket.requiredMCs;
  }

  childBaskets(): Basket[] {
    return [];
  }

  isFulfilled(academicPlan: AcademicPlanView): CriterionFulfillmentResult {
    const filteredModules = academicPlan.getModules().filter((module) => {
      // TODO
    });

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
  plans: Array<[SemOnePlan, SemTwoPlan]>;

  private modules: Array<Module> = [];
  private moduleCodeToModuleMap: Map<string, Module> = new Map();

  constructor(numYears: number) {
    this.plans = new Array(numYears);
    for (let i = 0; i < numYears; i++) {
      this.plans[i] = [new SemPlan([]), new SemPlan([])];
    }
  }

  preprocess() {
    this.moduleCodeToModuleMap.clear();
    for (const plan of this.plans) {
      for (const module of [...plan[0].modules, ...plan[1].modules]) {
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
    ArrayBasket.or([
      new ModuleBasket(pc2130),
      new ModuleBasket(pc2132),
      new ModuleBasket(st2132),
      new ModuleBasket(ec2101),
    ]),
  );

  const listIIIBasket = ArrayBasket.or([
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

  const listIVBasket = ArrayBasket.or([]);

  const am3ABasket = ArrayBasket.or([
    new ModuleBasket(ma3220),
    new ModuleBasket(ma3227),
    new ModuleBasket(ma3233),
    new ModuleBasket(ma3264),
    new ModuleBasket(st3131),
  ]);

  const am3BBasket = ArrayBasket.or([
    new ModuleBasket(ma3236),
    new ModuleBasket(ma3238),
    new ModuleBasket(ma3252),
    new ModuleBasket(ma3269),
    new ModuleBasket(st3131),
  ]);

  const am3Basket = ArrayBasket.or([am3ABasket, am3BBasket]);

  const am4ABasket = ArrayBasket.or([
    new ModuleBasket(ma4229),
    new ModuleBasket(ma4230),
    new ModuleBasket(ma4255),
    new ModuleBasket(ma4261),
    new ModuleBasket(ma4268),
    new ModuleBasket(ma4270),
  ]);

  const am4BBasket = ArrayBasket.or([
    new ModuleBasket(ma4235),
    new ModuleBasket(ma4254),
    new ModuleBasket(ma4260),
    new ModuleBasket(ma4261),
    new ModuleBasket(ma4268),
    new ModuleBasket(ma4270),
  ]);

  const am4Basket = ArrayBasket.or([am4ABasket, am4BBasket]);

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

  const level1000Basket = ArrayBasket.and([
    ArrayBasket.or([
      new ModuleBasket(ma1100),
      new ModuleBasket(ma1100t),
      new ModuleBasket(cs1231),
      new ModuleBasket(cs1231s),
    ]),
    ArrayBasket.or([new ModuleBasket(ma1101r), new ModuleBasket(ma2001)]),
    ArrayBasket.or([new ModuleBasket(ma1102r), new ModuleBasket(ma2002)]),
    ArrayBasket.or([
      new ModuleBasket(cs1010),
      new ModuleBasket(cs1010e),
      new ModuleBasket(cs1010s),
      new ModuleBasket(cs1010x),
      new ModuleBasket(cs1101s),
    ]),
  ]);

  // The last part of the level 2000 basket is "Pass one additional mod from List II, III, IV"
  const level2000Basket = ArrayBasket.and([
    ArrayBasket.or([new ModuleBasket(ma2101), new ModuleBasket(ma2101s)]),
    new ModuleBasket(ma2104),
    ArrayBasket.or([new ModuleBasket(ma2108), new ModuleBasket(ma2108s)]),
    new ModuleBasket(ma2213),
    ArrayBasket.or([
      new ModuleBasket(ma2216),
      new ModuleBasket(ma2116),
      new ModuleBasket(st2131),
    ]),
    ArrayBasket.or([
      new StatefulBasket(listIIBasket, listState),
      new StatefulBasket(listIIIBasket, listState),
      new StatefulBasket(listIVBasket, listState),
    ]),
  ]);

  const level3000Basket = ArrayBasket.and([
    new StatefulBasket(am3BBasket, am3State),
    new StatefulBasket(am3Basket, am3State),
    new StatefulBasket(am3Basket, am3State),
    ArrayBasket.or([
      new StatefulBasket(listIIIBasket, listState),
      new StatefulBasket(listIVBasket, listState),
    ]),
  ]);

  const level4000Basket = ArrayBasket.and([
    new ModuleBasket(ma4199),
    new StatefulBasket(am4Basket, am4State),
    new StatefulBasket(am4Basket, am4State),
    new StatefulBasket(am4Basket, am4State),
    new StatefulBasket(am4Basket, am4State),
    new StatefulBasket(listIVBasket, listState),
  ]);

  const appliedMathBasket = ArrayBasket.and([
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

function testCS2019Plan() {
  // ULR
  const gehxxxx = new Module("GEHXXXX", "", 4);
  const geqxxxx = new Module("GEHXXXX", "", 4);
  const gerxxxx = new Module("GEHXXXX", "", 4);
  const gesxxxx = new Module("GEHXXXX", "", 4);
  const getxxxx = new Module("GEHXXXX", "", 4);

  const ulrBasket = ArrayBasket.and([
    new ModuleBasket(gehxxxx),
    new ModuleBasket(geqxxxx),
    new ModuleBasket(gerxxxx),
    new ModuleBasket(gesxxxx),
    new ModuleBasket(getxxxx),
  ]);

  // CS Foundation
  const cs1101s = new Module("CS1101S", "", 4);
  const cs1010x = new Module("CS1010X", "", 4);
  const cs1231s = new Module("CS1231s", "", 4);
  const cs2030s = new Module("CS2030s", "", 4);
  const cs2040s = new Module("CS2040s", "", 4);
  const cs2100 = new Module("CS2100", "", 4);
  const cs2103t = new Module("CS2103T", "", 4);
  const cs2105 = new Module("CS2105", "", 4);
  const cs2106 = new Module("CS2106", "", 4);
  const cs3230 = new Module("CS3230", "", 4);

  const csFoundationBasket = ArrayBasket.and([
    ArrayBasket.or([new ModuleBasket(cs1101s), new ModuleBasket(cs1010x)]),
    ArrayBasket.and([
      new ModuleBasket(cs1231s),
      new ModuleBasket(cs2030s),
      new ModuleBasket(cs2040s),
      new ModuleBasket(cs2100),
      new ModuleBasket(cs2103t),
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

  const csTeamProjectBasket = ArrayBasket.or([
    new ModuleBasket(cs3203),
    ArrayBasket.and([new ModuleBasket(cs3216), new ModuleBasket(cs3217)]),
    ArrayBasket.and([new ModuleBasket(cs3281), new ModuleBasket(cs3282)]),
  ]);

  // IT professionalism
  const is1103 = new Module("IS1103", "", 4);
  const is1108 = new Module("IS1108", "", 4);
  const cs2101 = new Module("CS2101", "", 4);
  const es2660 = new Module("ES2660", "", 4);

  const csItProfessionalismBasket = ArrayBasket.and([
    ArrayBasket.or([new ModuleBasket(is1103), new ModuleBasket(is1108)]),
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

  const csIndustryExpBasket = ArrayBasket.or([
    new ModuleBasket(cp3880),
    ArrayBasket.or([new ModuleBasket(cp3200), new ModuleBasket(cp3202)]),
    ArrayBasket.or([new ModuleBasket(cp3107), new ModuleBasket(cp3110)]),
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

  const csMathAndSciBasket = ArrayBasket.and([
    ArrayBasket.or([
      ArrayBasket.and([new ModuleBasket(st2131), new ModuleBasket(st2132)]),
      new ModuleBasket(st2334),
    ]),
    new ModuleBasket(ma1101r),
    new ModuleBasket(ma1521),
    ArrayBasket.or([new ModuleBasket(pc1221)]),
  ]);

  // SWE Focus Area
  const cs3213 = new Module("CS3213", "", 4);
  const cs3219 = new Module("CS3219", "", 4);
  const cs4211 = new Module("CS4211", "", 4);
  const cs4218 = new Module("CS4218", "", 4);
  const cs4239 = new Module("CS4239", "", 4);
  const csSWEFABasketState = new BasketState();

  // This probably needs to be a stateful basket or something to prevent doublecounting?
  const csSWEFocusAreaPrimaries = ArrayBasket.atLeastN(3, [
    new StatefulBasket(
      ArrayBasket.atLeastN(1, [
        new ModuleBasket(cs4211),
        new ModuleBasket(cs4218),
        new ModuleBasket(cs4239),
      ]),
      csSWEFABasketState,
    ),
    new StatefulBasket(
      ArrayBasket.atLeastN(2, [
        new ModuleBasket(cs2103t),
        new ModuleBasket(cs3213),
        new ModuleBasket(cs3219),
        new ModuleBasket(cs4211),
        new ModuleBasket(cs4218),
        new ModuleBasket(cs4239),
      ]),
      csSWEFABasketState,
    ),
  ]);

  // Algos Focus Area
  const cs3231 = new Module("CS3231", "", 4);
  const cs3236 = new Module("CS3236", "", 4);
  const cs4231 = new Module("CS4231", "", 4);
  const cs4232 = new Module("CS4232", "", 4);
  const cs4234 = new Module("CS4234", "", 4);
  const csAlgosFABasketState = new BasketState();

  const csAlgosFocusAreaPrimaries = ArrayBasket.atLeastN(3, [
    new StatefulBasket(
      ArrayBasket.atLeastN(1, [
        new ModuleBasket(cs4231),
        new ModuleBasket(cs4232),
        new ModuleBasket(cs4234),
      ]),
      csAlgosFABasketState,
    ),
    new StatefulBasket(
      ArrayBasket.atLeastN(2, [
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
  const cs3243 = new Module("cs3243", "", 4);
  const cs3244 = new Module("CS3244", "", 4);
  const cs3263 = new Module("CS3263", "", 4);
  const cs3264 = new Module("CS3264", "", 4);
  const cs4243 = new Module("CS4243", "", 4);
  const cs4244 = new Module("CS4244", "", 4);
  const cs4246 = new Module("CS4246", "", 4);
  const cs4248 = new Module("CS4248", "", 4);
  const csAIFABasketState = new BasketState();

  const csAIFocusAreaPrimaries = ArrayBasket.atLeastN(3, [
    new StatefulBasket(
      ArrayBasket.atLeastN(1, [
        new ModuleBasket(cs4243),
        new ModuleBasket(cs4244),
        new ModuleBasket(cs4246),
        new ModuleBasket(cs4248),
      ]),
      csAIFABasketState,
    ),
    new StatefulBasket(
      ArrayBasket.atLeastN(2, [
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
    24,
    ArrayBasket.and([
      new StatefulBasket(
        ArrayBasket.or([
          csSWEFocusAreaPrimaries,
          csAlgosFocusAreaPrimaries,
          csAIFocusAreaPrimaries,
          /* other focus area primaries */
        ]),
        csBreadthAndDepthState,
      ),
      new StatefulBasket(
        FulfillmentResultBasket.atLeastNMCs(
          12,
          new MultiModuleBasket({
            moduleCodePrefix: new Set(["CS"]),
          }),
        ),
        /* All CS coded modules */ csBreadthAndDepthState,
      ),
    ]),
  );

  const csDegree = ArrayBasket.and([
    ulrBasket,
    csFoundationBasket,
    csBreadthAndDepthBasket,
    csTeamProjectBasket,
    csItProfessionalismBasket,
    csMathAndSciBasket,
  ]);
}

export {};
