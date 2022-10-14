import yaml from "js-yaml";
import * as fs from "fs";
import * as baskets from ".";
import * as log from "./log";

type Shared<T> = T & {
  description?: string;
  state?: string;
  at_least_n_mcs?: number;
};

type ModuleCode = string;
type ModuleBasket = {
  code?: string;
  mc?: number;
  code_pattern?: string;
  code_prefix?: string;
  code_suffix?: string;
  level?: number;
  double_count?: boolean;
  required_mcs?: number;
  early_terminate?: boolean;
};

type BasketOption = Shared<
  | { at_least_n_of: { n: number; baskets: ArrayBasket } }
  | {
      and: ArrayBasket;
    }
  | {
      or: ArrayBasket;
    }
  | { module: ModuleBasket }
>;

type BasketOptionRecord = {
  [label: string]: BasketOption;
};

type ArrayBasketElement = BasketOptionRecord | ModuleCode;

type ArrayBasket = Array<ArrayBasketElement>;

type TopLevelBasket = BasketOptionRecord;

function getAndAddIfNotExists(
  map: Map<string, baskets.Module>,
  moduleCode: string,
  mc: number = 4,
) {
  if (!map.has(moduleCode)) {
    map.set(moduleCode, new baskets.Module(moduleCode, "", mc)); // TODO
  }

  return map.get(moduleCode)!;
}

function convertArrayBasketElement(
  arrayBasketElement: ArrayBasketElement,
  modulesMap: Map<string, baskets.Module>,
  doubleCountSet: Map<string, Array<baskets.ModuleBasket>>,
  states: Map<string, baskets.BasketState>,
): baskets.Basket {
  if (typeof arrayBasketElement === "string") {
    return convertBasketOption(
      { description: "", module: { code: arrayBasketElement } },
      modulesMap,
      doubleCountSet,
      states,
    );
  } else {
    return convertBasketOptionRecord(
      arrayBasketElement,
      modulesMap,
      doubleCountSet,
      states,
    );
  }
}

function convertBasketOption(
  basketOption: BasketOption,
  modulesMap: Map<string, baskets.Module>,
  doubleCountSet: Map<string, Array<baskets.ModuleBasket>>,
  states: Map<string, baskets.BasketState>,
): baskets.Basket {
  let basket: baskets.Basket;
  if ("and" in basketOption) {
    const basketElements = basketOption.and.map((arrayBasketElement) =>
      convertArrayBasketElement(
        arrayBasketElement,
        modulesMap,
        doubleCountSet,
        states,
      ),
    );
    basket = baskets.ArrayBasket.and(
      basketOption.description || "",
      basketElements,
    );
  } else if ("or" in basketOption) {
    const basketElements = basketOption.or.map((arrayBasketElement) =>
      convertArrayBasketElement(
        arrayBasketElement,
        modulesMap,
        doubleCountSet,
        states,
      ),
    );
    basket = baskets.ArrayBasket.or("", basketElements);
  } else if ("module" in basketOption) {
    if (basketOption.module.code) {
      const moduleBasket = new baskets.ModuleBasket(
        getAndAddIfNotExists(
          modulesMap,
          basketOption.module.code,
          basketOption.module.mc,
        ),
      );
      basket = moduleBasket;
      if (basketOption.module.double_count) {
        if (!doubleCountSet.has(basketOption.module.code)) {
          doubleCountSet.set(basketOption.module.code, []);
        }
        doubleCountSet.get(basketOption.module.code)!.push(moduleBasket);
      }
    } else if (
      basketOption.module.code_prefix !== undefined ||
      basketOption.module.code_suffix !== undefined ||
      basketOption.module.code_pattern !== undefined ||
      basketOption.module.level
    ) {
      basket = new baskets.MultiModuleBasket({
        moduleCodePrefix: basketOption.module.code_prefix
          ? new Set([basketOption.module.code_prefix])
          : undefined,
        moduleCodeSuffix: basketOption.module.code_suffix
          ? new Set([basketOption.module.code_suffix])
          : undefined,
        moduleCodePattern: basketOption.module.code_pattern
          ? new RegExp(basketOption.module.code_pattern)
          : undefined,
        level: basketOption.module.level
          ? new Set([basketOption.module.level / 1000])
          : undefined,
        requiredMCs: basketOption.module.required_mcs,
        earlyTerminate: basketOption.module.early_terminate,
      });
    } else {
      throw new Error(
        "At least one Module parameter must be given by the config.",
      );
    }
  } else if ("at_least_n_of" in basketOption) {
    const basketElements = basketOption.at_least_n_of.baskets.map(
      (arrayBasketElement) =>
        convertArrayBasketElement(
          arrayBasketElement,
          modulesMap,
          doubleCountSet,
          states,
        ),
    );
    basket = baskets.ArrayBasket.atLeastN(
      basketOption.description || "",
      basketOption.at_least_n_of.n,
      basketElements,
    );
  } else {
    throw new Error("Malformed config");
  }

  if (basketOption.at_least_n_mcs !== undefined) {
    basket = baskets.FulfillmentResultBasket.atLeastNMCs(
      "",
      basketOption.at_least_n_mcs,
      basket,
    );
  }

  if (basketOption.state) {
    if (!states.has(basketOption.state)) {
      states.set(basketOption.state, new baskets.BasketState());
    }
    basket = new baskets.StatefulBasket(basket, states.get(basketOption.state));
  }

  return basket;
}

function convertBasketOptionRecord(
  basketOptionRecord: BasketOptionRecord,
  modulesMap: Map<string, baskets.Module>,
  doubleCountSet: Map<string, Array<baskets.ModuleBasket>>,
  states: Map<string, baskets.BasketState>,
) {
  const label = Object.keys(basketOptionRecord)[0];
  const basketOption = basketOptionRecord[label] as BasketOption;
  const basket = convertBasketOption(
    basketOption,
    modulesMap,
    doubleCountSet,
    states,
  );
  basket.name = label;
  return basket;
}

export class ConvertedConfig {
  // If I'm not wrong, removing this declare would cause a cyclical dependency
  // A better thing to do is to move all baskets into some file like basket.ts to break the circular dependency between
  // index.ts and input.ts
  declare static placeholderBasket: baskets.Basket;
  basket: baskets.Basket;
  allModules: Map<string, baskets.Module>;
  doubleCountedModules: Map<string, Array<baskets.ModuleBasket>>;
  states: Map<string, baskets.BasketState>;
  constructor() {
    this.basket = ConvertedConfig.placeholderBasket;
    this.allModules = new Map();
    this.doubleCountedModules = new Map();
    this.states = new Map();
  }
}

export function convertConfigBasket(
  topLevelBasket: TopLevelBasket,
): ConvertedConfig {
  const convertedConfig = new ConvertedConfig();
  convertedConfig.basket = convertBasketOptionRecord(
    topLevelBasket,
    convertedConfig.allModules,
    convertedConfig.doubleCountedModules,
    convertedConfig.states,
  );
  return convertedConfig;
}

export function testLoadRequirements() {
  const topLevelBasket = yaml.load(
    fs.readFileSync("./requirements.json", "utf8"),
  ) as TopLevelBasket;

  const convertedBasket = convertConfigBasket(topLevelBasket);
  return convertedBasket;
}
