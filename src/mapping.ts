import * as frontend from "./frontend";
import * as basket from "./basket";
import * as input from "./input";
import * as plan from "./plan";
class ModuleViewModel implements frontend.Module {
  color?: string | undefined;
  editable?: boolean | undefined;
  prereqs?: frontend.PrereqTree | undefined;
  prereqsViolated?: string[][] | undefined;
  module: plan.Module;

  public get code(): string {
    return this.module.code;
  }

  public get name(): string {
    return this.module.name;
  }

  public get credits(): number {
    return this.module.credits;
  }

  constructor(module: plan.Module) {
    this.module = module;
  }
}

class MultiModuleViewModel implements frontend.Module {
  color?: string | undefined;
  code!: string;
  name!: string;
  credits!: number;
  editable?: boolean | undefined;
  prereqs?: frontend.PrereqTree | undefined;
  prereqsViolated?: string[][] | undefined;

  constructor(model: MultiModuleViewModel) {
    Object.assign(this, model);
  }
}

type ModuleSpecifier = basket.ModuleBasket | basket.MultiModuleBasket;
class BasketFlattener extends basket.BasketVisitor<Array<ModuleSpecifier>> {
  visitStatefulBasket(basket: basket.StatefulBasket): Array<ModuleSpecifier> {
    return this.visit(basket.basket);
  }
  visitArrayBasket(basket: basket.ArrayBasket): Array<ModuleSpecifier> {
    return basket.baskets.flatMap((basket) => this.visit(basket));
  }
  visitFulfillmentResultBasket(
    basket: basket.FulfillmentResultBasket,
  ): Array<ModuleSpecifier> {
    return this.visit(basket.basket);
  }
  visitModuleBasket(basket: basket.ModuleBasket): Array<ModuleSpecifier> {
    return [basket];
  }
  visitMultiModuleBasket(
    basket: basket.MultiModuleBasket,
  ): Array<ModuleSpecifier> {
    return [basket];
  }
}

class RequirementViewModel implements frontend.Requirement {
  totalCredits: number;
  modules: frontend.Module[];
  private basket: basket.Basket;

  constructor(basket: basket.Basket) {
    this.basket = basket;
    this.totalCredits = -1; // I don't think this is possible?
    this.modules = new BasketFlattener()
      .visit(basket)
      .map((basket): frontend.Module => {
        if ("module" in basket) {
          return new ModuleViewModel(basket.module);
        } else {
          return new MultiModuleViewModel({
            code: basket.getEffectivePattern(),
            credits: -1,
            name: "Select A Basket",
          });
        }
      });
  }

  public get title(): string {
    return this.basket.title;
  }

  public get description(): string {
    return this.basket.description || "";
  }
}

class MainViewModel implements frontend.ModulesState {
  private _requirements?: Array<RequirementViewModel>;
  private academicPlan: plan.AcademicPlan;
  private validatorState: input.ValidatorState;

  constructor(startYear: number, numYears = 4) {
    this.academicPlan = new plan.AcademicPlan(startYear, numYears);
    this.validatorState = new input.ValidatorState();
  }

  public get planner() {
    return this.academicPlan.plans;
  }

  public get requirements(): Array<RequirementViewModel> {
    if (this.validatorState.isUninitialized()) {
      return [];
    }

    if (this._requirements === undefined) {
      this._requirements = this.validatorState.basket
        .childBaskets()
        .map((basket) => new RequirementViewModel(basket));
    }

    return this._requirements;
  }

  get modulesMap(): Map<string, plan.Module> {
    return this.validatorState.allModules;
  }

  public get startYear(): string {
    return this.academicPlan.startYear.toString();
  }

  initializeFromURL(url: string) {
    this.validatorState.initializeFromURL(url);
  }
}
