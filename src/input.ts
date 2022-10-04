import yaml from "js-yaml";
import * as fs from "fs";
import * as baskets from ".";
import * as log from "./log";

type ModuleCode = string;
type ModuleBasket = {
  code?: string;
  code_pattern?: string;
  level?: number;
};

type BasketOption =
  | { at_least_n_of: { n: number; baskets: ArrayBasket } }
  | {
      and: ArrayBasket;
    }
  | {
      or: ArrayBasket;
    }
  | { module: ModuleBasket };

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
): baskets.Basket {
  if (typeof arrayBasketElement === "string") {
    return convertBasketOption(
      { module: { code: arrayBasketElement } },
      modulesMap,
    );
  } else {
    return convertBasketOptionRecord(arrayBasketElement, modulesMap);
  }
}

function convertBasketOption(
  basketOption: BasketOption,
  modulesMap: Map<string, baskets.Module>,
): baskets.Basket {
  if ("and" in basketOption) {
    const basketElements = basketOption.and.map((arrayBasketElement) =>
      convertArrayBasketElement(arrayBasketElement, modulesMap),
    );
    return baskets.ArrayBasket.and(basketElements);
  } else if ("or" in basketOption) {
    const basketElements = basketOption.or.map((arrayBasketElement) =>
      convertArrayBasketElement(arrayBasketElement, modulesMap),
    );
    return baskets.ArrayBasket.or(basketElements);
  } else if ("module" in basketOption) {
    let module: baskets.Module;
    if (basketOption.module.code) {
      module = getAndAddIfNotExists(modulesMap, basketOption.module.code);
    } else if (basketOption.module.code_pattern) {
      // TODO
      module = new baskets.Module("ZZ9999THISISNOTAMOD", "", 4);
      // throw new Error("TODO");
    } else if (basketOption.module.level) {
      // TODO
      throw new Error("TODO");
    } else {
      module = new baskets.Module("ZZ9999THISISNOTAMOD", "", 4);
      // throw new Error(
      //   "At least one Module parameter must be given by the config.",
      // );
    }
    return new baskets.ModuleBasket(module);
  } else if ("at_least_n_of" in basketOption) {
    const basketElements = basketOption.at_least_n_of.baskets.map(
      (arrayBasketElement) =>
        convertArrayBasketElement(arrayBasketElement, modulesMap),
    );
    return baskets.ArrayBasket.atLeastN(
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
) {
  const label = Object.keys(basketOptionRecord)[0];
  const basketOption = basketOptionRecord[label] as BasketOption;
  return convertBasketOption(basketOption, modulesMap);
}

function convertConfigBasket(topLevelBasket: TopLevelBasket): baskets.Basket {
  return convertBasketOptionRecord(
    topLevelBasket,
    new Map<string, baskets.Module>(),
  );
}

const topLevelBasket = yaml.load(
  fs.readFileSync("./requirements.json", "utf8"),
) as TopLevelBasket;
log.log(topLevelBasket);
const convertedBasket = convertConfigBasket(topLevelBasket);
log.log(convertedBasket);
