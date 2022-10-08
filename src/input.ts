import yaml from "js-yaml";
import * as fs from "fs";
import * as baskets from ".";
import * as log from "./log";

type WithDescription<T> = T & { description?: string };

type ModuleCode = string;
type ModuleBasket = {
  code?: string;
  code_pattern?: string;
  level?: number;
  double_count?: boolean;
};

type BasketOption = WithDescription<
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
) {
  if (!map.has(moduleCode)) {
    map.set(moduleCode, new baskets.Module(moduleCode, "", 4)); // TODO
  }

  return map.get(moduleCode)!;
}

function convertArrayBasketElement(
  arrayBasketElement: ArrayBasketElement,
  modulesMap: Map<string, baskets.Module>,
  doubleCountSet: Map<string, Array<baskets.ModuleBasket>>,
): baskets.Basket {
  if (typeof arrayBasketElement === "string") {
    return convertBasketOption(
      { description: "", module: { code: arrayBasketElement } },
      modulesMap,
      doubleCountSet,
    );
  } else {
    return convertBasketOptionRecord(
      arrayBasketElement,
      modulesMap,
      doubleCountSet,
    );
  }
}

function convertBasketOption(
  basketOption: BasketOption,
  modulesMap: Map<string, baskets.Module>,
  doubleCountSet: Map<string, Array<baskets.ModuleBasket>>,
): baskets.Basket {
  if ("and" in basketOption) {
    const basketElements = basketOption.and.map((arrayBasketElement) =>
      convertArrayBasketElement(arrayBasketElement, modulesMap, doubleCountSet),
    );
    return baskets.ArrayBasket.and(
      basketOption.description || "",
      basketElements,
    );
  } else if ("or" in basketOption) {
    const basketElements = basketOption.or.map((arrayBasketElement) =>
      convertArrayBasketElement(arrayBasketElement, modulesMap, doubleCountSet),
    );
    return baskets.ArrayBasket.or("", basketElements);
  } else if ("module" in basketOption) {
    let basket;
    if (basketOption.module.code) {
      basket = new baskets.ModuleBasket(
        getAndAddIfNotExists(modulesMap, basketOption.module.code),
      );
      if (basketOption.module.double_count) {
        if (!doubleCountSet.has(basketOption.module.code)) {
          doubleCountSet.set(basketOption.module.code, []);
        }
        doubleCountSet.get(basketOption.module.code)!.push(basket);
      }
    } else if (basketOption.module.code_pattern !== undefined) {
      basket = new baskets.MultiModuleBasket({
        moduleCodePattern: new RegExp(basketOption.module.code_pattern),
      });
    } else if (basketOption.module.level) {
      basket = new baskets.MultiModuleBasket({
        level: new Set([basketOption.module.level / 1000]),
      });
    } else {
      throw new Error(
        "At least one Module parameter must be given by the config.",
      );
    }
    return basket;
  } else if ("at_least_n_of" in basketOption) {
    const basketElements = basketOption.at_least_n_of.baskets.map(
      (arrayBasketElement) =>
        convertArrayBasketElement(
          arrayBasketElement,
          modulesMap,
          doubleCountSet,
        ),
    );
    return baskets.ArrayBasket.atLeastN(
      basketOption.description || "",
      basketOption.at_least_n_of.n,
      basketElements,
    );
  } else {
    throw new Error("Malformed config");
  }
}

function convertBasketOptionRecord(
  basketOptionRecord: BasketOptionRecord,
  modulesMap: Map<string, baskets.Module>,
  doubleCountSet: Map<string, Array<baskets.ModuleBasket>>,
) {
  const label = Object.keys(basketOptionRecord)[0];
  const basketOption = basketOptionRecord[label] as BasketOption;
  return convertBasketOption(basketOption, modulesMap, doubleCountSet);
}

export class ConvertedConfig {
  declare static placeholderBasket: baskets.Basket;
  basket: baskets.Basket;
  allModules: Map<string, baskets.Module>;
  doubleCountedModules: Map<string, Array<baskets.ModuleBasket>>;
  constructor() {
    this.basket = ConvertedConfig.placeholderBasket;
    this.allModules = new Map();
    this.doubleCountedModules = new Map();
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
  );
  return convertedConfig;
}

// const topLevelBasket = yaml.load(
//   fs.readFileSync("./requirements.json", "utf8"),
// ) as TopLevelBasket;
// log.log(topLevelBasket);
// const convertedBasket = convertConfigBasket(topLevelBasket);
// log.log(convertedBasket);
