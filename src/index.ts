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
  constructor(propertyName: K, equals: Module[K]) {
    super();
    this.propertyName = propertyName;
    this.equals = equals;
  }

  filter(module: Module): boolean {
    return module[this.propertyName] == this.equals;
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

abstract class Criterion {
  abstract isFulfilled(academicPlan: AcademicPlan): boolean;
}

class ArrayCriterion extends Criterion {
  criteria: Array<Criterion>;
  arrayOp: ArrayOp;
  constructor(criteria: Array<Criterion>, arrayOp: ArrayOp) {
    super();
    this.criteria = criteria;
    this.arrayOp = arrayOp;
  }

  isFulfilled(academicPlan: AcademicPlan): boolean {
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

class ArithmeticCriterion extends Criterion {
  where: Filter;
  binaryOp: BinaryOp;
  value: number;
  constructor(where: Filter, binaryOp: BinaryOp, value: number) {
    super();
    this.where = where;
    this.binaryOp = binaryOp;
    this.value = value;
  }

  isFulfilled(academicPlan: AcademicPlan): boolean {
    const filtered = academicPlan.getModules().filter(this.where.getFilter());
    switch (this.binaryOp) {
      case BinaryOp.EQ:
        return filtered.length === this.value;
      case BinaryOp.NEQ:
        return filtered.length !== this.value;
      case BinaryOp.GEQ:
        return filtered.length >= this.value;
      case BinaryOp.GT:
        return filtered.length > this.value;
      case BinaryOp.LEQ:
        return filtered.length <= this.value;
      case BinaryOp.LT:
        return filtered.length < this.value;
    }
  }
}

class PipelineCriterion extends Criterion {
  pipeline: Array<Criterion | Filter>;
  constructor(pipeline: Array<Criterion | Filter>) {
    super();
    this.pipeline = pipeline;
  }
  isFulfilled(academicPlan: AcademicPlan): boolean {
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
abstract class Basket {
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
}

// polymorphsim vs type switch, which would be better?
class OrBasket extends Basket {
  baskets: Array<Basket>;
  constructor(baskets: Array<Basket>) {
    super();
    this.baskets = baskets;
  }

  getDefaultCriterion(): Criterion {
    return new ArrayCriterion(
      this.baskets.map((basket) => basket.getCriterion()),
      ArrayOp.SOME
    );
  }
}

class AllBasket extends Basket {
  baskets: Array<Basket>;
  constructor(baskets: Array<Basket>) {
    super();
    this.baskets = baskets;
  }

  getDefaultCriterion(): Criterion {
    return new ArrayCriterion(
      this.baskets.map((basket) => basket.getCriterion()),
      ArrayOp.EVERY
    );
  }
}

class ModuleBasket extends Basket {
  module: Module;
  constructor(module: Module) {
    super();
    this.module = module;
  }

  getDefaultCriterion(): Criterion {
    return new ArithmeticCriterion(
      new PropertyFilter("code", this.module.code),
      BinaryOp.GT,
      0
    );
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
  const cs1231 = new Module("CS1231", "", 4);
  const ma1101r = new Module("MA1101R", "", 4);
  const ma1102r = new Module("MA1102R", "", 4);
  const cs1010 = new Module("CS1010", "", 4);
  const cs1010e = new Module("CS1010E", "", 4);
  const cs1010s = new Module("CS1010S", "", 4);
  const cs1010x = new Module("CS1010X", "", 4);
  const cs1101s = new Module("CS1101S", "", 4);

  // Level 2000
  const ma2101 = new Module("MA2101", "", 4);
  const ma2101s = new Module("MA2101S", "", 4);
  const ma2104 = new Module("MA2104", "", 4);
  const ma2108 = new Module("MA2108", "", 4);
  const ma2108s = new Module("MA2108S", "", 4);
  const ma2213 = new Module("MA2213", "", 4);
  const ma2216 = new Module("MA2216", "", 4);
  const ma2116 = new Module("MA2116", "", 4);
  const st2131 = new Module("ST2131", "", 4);

  // Level 3000

  // Level 4000

  const academicPlan = new AcademicPlan(4);
  const level1000Basket = new AllBasket([]);
}

export {};
