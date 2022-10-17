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
import { Module, AcademicPlanView, PropertySetFilter } from "./plan";

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

export abstract class Basket implements Criterion, CriterionEventDelegate {
  title: string;
  description?: string;
  criterionState: CriterionFulfillmentResult = new CriterionFulfillmentResult();
  parentBasket?: Basket;

  constructor(name: string = "") {
    this.title = name;
  }

  abstract accept<ReturnValue>(
    visitor: BasketVisitor<ReturnValue>,
  ): ReturnValue;

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
    return this.title.length > 0;
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

export class EmptyBasket extends Basket {
  constructor() {
    super("__Empty__");
  }
  accept<ReturnValue>(visitor: BasketVisitor<ReturnValue>): ReturnValue {
    throw new Error("Method not implemented.");
  }
  isFulfilled(academicPlan: AcademicPlanView): CriterionFulfillmentResult {
    return new CriterionFulfillmentResult(true, 0, new Set());
  }
  childBaskets(): Basket[] {
    return [];
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
    this.name = basket.title;
    this.criterionState = new PrintableCriterionState(basket.criterionState);
  }
}

export class BasketState {
  moduleCodesAlreadyMatched: Set<string>;
  constructor(moduleCodesAlreadyMatched: Set<string> = new Set()) {
    this.moduleCodesAlreadyMatched = moduleCodesAlreadyMatched;
  }
}

export abstract class BasketVisitor<ReturnValue> {
  abstract visitStatefulBasket(basket: StatefulBasket): ReturnValue;
  abstract visitArrayBasket(basket: ArrayBasket): ReturnValue;
  abstract visitFulfillmentResultBasket(
    basket: FulfillmentResultBasket,
  ): ReturnValue;
  abstract visitModuleBasket(basket: ModuleBasket): ReturnValue;
  abstract visitMultiModuleBasket(basket: MultiModuleBasket): ReturnValue;

  visit(basket: Basket) {
    return basket.accept<ReturnValue>(this);
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

  accept<ReturnValue>(visitor: BasketVisitor<ReturnValue>): ReturnValue {
    return visitor.visitStatefulBasket(this);
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

  accept<ReturnValue>(visitor: BasketVisitor<ReturnValue>): ReturnValue {
    return visitor.visitArrayBasket(this);
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

  accept<ReturnValue>(visitor: BasketVisitor<ReturnValue>): ReturnValue {
    return visitor.visitFulfillmentResultBasket(this);
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

  accept<ReturnValue>(visitor: BasketVisitor<ReturnValue>): ReturnValue {
    return visitor.visitModuleBasket(this);
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

  accept<ReturnValue>(visitor: BasketVisitor<ReturnValue>): ReturnValue {
    return visitor.visitMultiModuleBasket(this);
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
  // /(?<prefix>[A-Z]+)(?<codeNumber>\d)\d+(?<suffix>[A-Z]*)/
  getEffectivePattern(): string {
    if (this.moduleCodePattern) {
      return this.moduleCodePattern.source;
    } else {
      let str = "";

      if (this.level) {
        str = `${this.level}\\d{3}`;
      }

      if (this.moduleCodePrefix) {
        str = `^${this.moduleCodePrefix}` + str;
      }

      if (this.moduleCodeSuffix) {
        str = str + `${this.moduleCodeSuffix}$`;
      }

      return str;
    }
  }
}

export {};
