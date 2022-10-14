import * as frontend from "./frontend";
import * as basket from "./basket";

class ModuleViewModel implements frontend.Module {
  color?: string | undefined;
  editable?: boolean | undefined;
  prereqs?: frontend.PrereqTree | undefined;
  prereqsViolated?: string[][] | undefined;
  private module: basket.Module;

  public get code(): string {
    return this.module.code;
  }

  public get name(): string {
    return this.module.name;
  }

  public get credits(): number {
    return this.module.credits;
  }

  constructor(module: basket.Module) {
    this.module = module;
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
  title: string;
  description: string;
  totalCredits: number;
  modules: frontend.Module[];

  constructor(basket: basket.Basket) {
    this.title = basket.name;
    this.description = "TODO";
    this.totalCredits = -1; // I don't think this is possible?
    this.modules = new BasketFlattener()
      .visit(basket)
      .map((basket): frontend.Module => {
        if ("module" in basket) {
          return new ModuleViewModel(basket.module);
        } else {
          return {
            code: basket.getEffectivePattern(),
            credits: -1,
            name: "Select A Basket",
          };
        }
      });
  }
}

class SemesterViewModel implements frontend.Semester {
  year: number;
  semester: number;
  modules: frontend.Module[];
  constructor(semPlan: basket.SemPlan) {
    this.year = semPlan.year;
    this.semester = semPlan.semester;
    this.modules = semPlan.modules.map((module) => new ModuleViewModel(module));
  }
}
