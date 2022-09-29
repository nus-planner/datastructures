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
const moduleRegex = /[[:alpha:]]+(?<codeNumber>\d)\d+[[:alpha:]]*/;

class Module {
  code: string;
  level: number;
  name: string;
  credits: number;
  constructor(code: string, name: string, credits: number) {
    this.code = code;
    const match = moduleRegex.exec(code);
    if (match === null || match.groups === undefined) {
      throw new Error("Invalid module code");
    }
    this.level = Number.parseInt(match.groups["codeNumber"]);
    this.name = name;
    this.credits = credits;
  }
}

abstract class Filter {
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
      ? module[this.propertyName] == this.equals
      : module[this.propertyName] != this.equals;
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
  EQ,
  NEQ,
  GEQ,
  GT,
  LEQ,
  LT,
}

enum ArrayOp {
  EVERY,
  SOME,
}

class CriterionState {
  isLastFulfilled: boolean = false;
}

abstract class CriterionEvent {}

class CriterionMatchModuleEvent extends CriterionEvent {
  module: Module;
  constructor(module: Module) {
    super();
    this.module = module;
  }
}

interface CriterionEventDelegate {
  acceptCriterionEvent(event: CriterionEvent): void;
}

abstract class Criterion<S extends CriterionState = CriterionState> {
  declare state: S;
  parentCriterion?: Criterion;
  eventDelegate?: CriterionEventDelegate;
  abstract isFulfilled(academicPlan: AcademicPlanView): boolean;
  constructor(associatedBasket?: CriterionEventDelegate) {
    this.eventDelegate = associatedBasket;
  }

  sendEvent(event: CriterionEvent) {
    for (
      let current: Criterion | undefined = this;
      current !== undefined;
      current = current.parentCriterion
    ) {
      current.eventDelegate?.acceptCriterionEvent(event);
    }
  }
}

class TrueCriterion extends Criterion {
  isFulfilled(academicPlan: AcademicPlanView): boolean {
    return true;
  }
}

class ArrayCriterionState extends CriterionState {}

class ArrayCriterion extends Criterion<ArrayCriterionState> {
  criteria: Array<Criterion<any>>;
  arrayOp: ArrayOp;
  constructor(
    criteria: Array<Criterion<any>>,
    arrayOp: ArrayOp,
    associatedBasket?: CriterionEventDelegate
  ) {
    super(associatedBasket);
    this.criteria = criteria;
    this.arrayOp = arrayOp;
    criteria.forEach((c) => (c.parentCriterion = this));
  }

  isFulfilled(academicPlan: AcademicPlanView): boolean {
    switch (this.arrayOp) {
      case ArrayOp.EVERY:
        return this.criteria.every((criterion) =>
          criterion.isFulfilled(academicPlan)
        );
      case ArrayOp.SOME:
        return this.criteria.some((criterion) =>
          criterion.isFulfilled(academicPlan)
        );
    }
  }
}

class FilterCriterion extends Criterion {
  where: Filter;
  criterion: Criterion;
  constructor(
    where: Filter,
    criterion: Criterion,
    associatedBasket?: CriterionEventDelegate
  ) {
    super(associatedBasket);
    this.where = where;
    this.criterion = criterion;
    criterion.parentCriterion = this;
  }

  isFulfilled(academicPlan: AcademicPlanView): boolean {
    return this.criterion.isFulfilled(
      academicPlan.withModulesFilteredBy(this.where)
    );
  }
}

class ArithmeticCriterion extends Criterion {
  binaryOp: BinaryOp;
  value: number;
  constructor(
    binaryOp: BinaryOp,
    value: number,
    associatedBasket?: CriterionEventDelegate
  ) {
    super(associatedBasket);
    this.binaryOp = binaryOp;
    this.value = value;
  }

  isFulfilled(academicPlan: AcademicPlanView): boolean {
    const modules = academicPlan.modules;
    switch (this.binaryOp) {
      case BinaryOp.EQ:
        return modules.length === this.value;
      case BinaryOp.NEQ:
        return modules.length !== this.value;
      case BinaryOp.GEQ:
        return modules.length >= this.value;
      case BinaryOp.GT:
        return modules.length > this.value;
      case BinaryOp.LEQ:
        return modules.length <= this.value;
      case BinaryOp.LT:
        return modules.length < this.value;
    }
  }
}

class PipelineCriterion extends Criterion {
  pipeline: Array<Criterion<any> | Filter>;
  constructor(
    pipeline: Array<Criterion | Filter>,
    associatedBasket?: CriterionEventDelegate
  ) {
    super(associatedBasket);
    this.pipeline = pipeline;
  }
  isFulfilled(academicPlan: AcademicPlanView): boolean {
    let modules = academicPlan.getModules();
    for (const item of this.pipeline) {
      if (item instanceof Filter) {
        modules = modules.filter(item.getFilter());
      } else if (item instanceof Criterion) {
        if (!item.isFulfilled(academicPlan)) {
          return false;
        }
      }
    }
    return true;
  }
}

/**
 * A Basket is a collection of modules. In particular, a Basket can contain a single module
 */
abstract class Basket implements CriterionEventDelegate {
  additionalCriterion?: Criterion;
  abstract getDefaultCriterion(): Criterion;
  getCriterion(): Criterion {
    return this.additionalCriterion
      ? new ArrayCriterion(
          [this.getDefaultCriterion(), this.additionalCriterion],
          ArrayOp.EVERY
        )
      : this.getDefaultCriterion();
  }

  abstract acceptCriterionEvent(event: CriterionEvent): void;
}

class BasketState {
  moduleCodesAlreadyMatched: Set<string>;
  constructor(moduleCodesAlreadyMatched: Set<string> = new Set()) {
    this.moduleCodesAlreadyMatched = moduleCodesAlreadyMatched;
  }
}

class StatefulBasket extends Basket {
  basket: Basket;
  state: BasketState;
  constructor(basket: Basket, state: BasketState = new BasketState()) {
    super();
    this.basket = basket;
    this.state = state;
  }

  getDefaultCriterion(): Criterion {
    return new FilterCriterion(
      new PropertySetFilter("code", this.state.moduleCodesAlreadyMatched),
      this.basket.getCriterion(),
      this
    );
  }

  acceptCriterionEvent(event: CriterionEvent): void {
    if (event instanceof CriterionMatchModuleEvent) {
      this.state.moduleCodesAlreadyMatched.add(event.module.code);
    }
  }
}

abstract class ArrayBasket extends Basket {
  baskets: Array<Basket>;
  constructor(baskets: Array<Basket>) {
    super();
    this.baskets = baskets;
  }
}

class OrBasket extends ArrayBasket {
  constructor(baskets: Array<Basket>) {
    super(baskets);
  }

  getDefaultCriterion(): Criterion {
    return new ArrayCriterion(
      this.baskets.map((basket) => basket.getCriterion()),
      ArrayOp.SOME,
      this
    );
  }

  acceptCriterionEvent(event: CriterionEvent): void {
    console.log("Nothing is done so far.");
  }
}

class AndBasket extends ArrayBasket {
  constructor(baskets: Array<Basket>) {
    super(baskets);
  }

  getDefaultCriterion(): Criterion {
    return new ArrayCriterion(
      this.baskets.map((basket) => basket.getCriterion()),
      ArrayOp.EVERY,
      this
    );
  }

  acceptCriterionEvent(event: CriterionEvent): void {
    console.log("Nothing is done so far.");
  }
}

class ModuleBasket extends Basket {
  module: Module;
  constructor(module: Module) {
    super();
    this.module = module;
  }

  getDefaultCriterion(): Criterion {
    return new FilterCriterion(
      new PropertyFilter("code", this.module.code),
      new ArithmeticCriterion(BinaryOp.GT, 0),
      this
    );
  }

  acceptCriterionEvent(event: CriterionEvent): void {
    throw new Error("Method not implemented.");
  }
}

class SemPlan {
  modules: Array<Module>;

  moduleCodeToModuleMap: Map<string, Module> = new Map();

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

type SemOnePlan = SemPlan;
type SemTwoPlan = SemPlan;

class AcademicPlanView {
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
      this.academicPlan.getModules()
    );
  }
}

class AcademicPlan {
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
    new OrBasket([
      new ModuleBasket(pc2130),
      new ModuleBasket(pc2132),
      new ModuleBasket(st2132),
      new ModuleBasket(ec2101),
    ])
  );

  const listIIIBasket = new OrBasket([
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

  const listIVBasket = new OrBasket([]);

  const am3ABasket = new OrBasket([
    new ModuleBasket(ma3220),
    new ModuleBasket(ma3227),
    new ModuleBasket(ma3233),
    new ModuleBasket(ma3264),
    new ModuleBasket(st3131),
  ]);

  const am3BBasket = new OrBasket([
    new ModuleBasket(ma3236),
    new ModuleBasket(ma3238),
    new ModuleBasket(ma3252),
    new ModuleBasket(ma3269),
    new ModuleBasket(st3131),
  ]);

  const am3Basket = new OrBasket([am3ABasket, am3BBasket]);

  const am4ABasket = new OrBasket([
    new ModuleBasket(ma4229),
    new ModuleBasket(ma4230),
    new ModuleBasket(ma4255),
    new ModuleBasket(ma4261),
    new ModuleBasket(ma4268),
    new ModuleBasket(ma4270),
  ]);

  const am4BBasket = new OrBasket([
    new ModuleBasket(ma4235),
    new ModuleBasket(ma4254),
    new ModuleBasket(ma4260),
    new ModuleBasket(ma4261),
    new ModuleBasket(ma4268),
    new ModuleBasket(ma4270),
  ]);

  const am4Basket = new OrBasket([am4ABasket, am4BBasket]);

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
      ].map((mod) => mod.code)
    )
  );
  const am3State = new BasketState();
  const am4State = new BasketState();

  const level1000Basket = new AndBasket([
    new OrBasket([
      new ModuleBasket(ma1100),
      new ModuleBasket(ma1100t),
      new ModuleBasket(cs1231),
      new ModuleBasket(cs1231s),
    ]),
    new OrBasket([new ModuleBasket(ma1101r), new ModuleBasket(ma2001)]),
    new OrBasket([new ModuleBasket(ma1102r), new ModuleBasket(ma2002)]),
    new OrBasket([
      new ModuleBasket(cs1010),
      new ModuleBasket(cs1010e),
      new ModuleBasket(cs1010s),
      new ModuleBasket(cs1010x),
      new ModuleBasket(cs1101s),
    ]),
  ]);

  // The last part of the level 2000 basket is "Pass one additional mod from List II, III, IV"
  const level2000Basket = new AndBasket([
    new OrBasket([new ModuleBasket(ma2101), new ModuleBasket(ma2101s)]),
    new ModuleBasket(ma2104),
    new OrBasket([new ModuleBasket(ma2108), new ModuleBasket(ma2108s)]),
    new ModuleBasket(ma2213),
    new OrBasket([
      new ModuleBasket(ma2216),
      new ModuleBasket(ma2116),
      new ModuleBasket(st2131),
    ]),
    new OrBasket([
      new StatefulBasket(listIIBasket, listState),
      new StatefulBasket(listIIIBasket, listState),
      new StatefulBasket(listIVBasket, listState),
    ]),
  ]);

  const level3000Basket = new AndBasket([
    new StatefulBasket(am3BBasket, am3State),
    new StatefulBasket(am3Basket, am3State),
    new StatefulBasket(am3Basket, am3State),
    new OrBasket([
      new StatefulBasket(listIIIBasket, listState),
      new StatefulBasket(listIVBasket, listState),
    ]),
  ]);

  const level4000Basket = new AndBasket([
    new ModuleBasket(ma4199),
    new StatefulBasket(am4Basket, am4State),
    new StatefulBasket(am4Basket, am4State),
    new StatefulBasket(am4Basket, am4State),
    new StatefulBasket(am4Basket, am4State),
    new StatefulBasket(listIVBasket, listState),
  ]);
}

export {};
