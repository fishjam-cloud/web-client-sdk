/**
 * Save a string value to local storage
 *
 * @param key - key to save the value
 * @param value - value to save
 */
export const saveString = (key: string, value: string) => {
  localStorage.setItem(key, value);
};

/**
 * Load a string value from local storage
 *
 * @param key - key to load the value
 * @param defaultValue - default value to return if the key is not found
 * @returns loaded value or default value
 */
export const loadString = (key: string, defaultValue = "") => {
  const value = localStorage.getItem(key);
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return value;
};

/**
 * Save an object to local storage.
 * Make sure the object is serializable.
 *
 * @param key - key to save the value
 * @param value - object to save
 */
export const saveObject = <T>(key: string, value: T) => {
  const stringValue = JSON.stringify(value);
  saveString(key, stringValue);
};

/**
 * Load an object from local storage.
 *
 * @param key - key to load the value
 * @param defaultValue - default value to return if the key is not found
 * @returns loaded object or default value
 */
export const loadObject = <T>(key: string, defaultValue: T): T => {
  const stringValue = loadString(key, "");
  if (stringValue === "") {
    return defaultValue;
  }
  return JSON.parse(stringValue) as T;
};

/**
 * Remove a saved item from local storage
 * @param key - key to remove
 */
export const removeSavedItem = (key: string) => {
  localStorage.removeItem(key);
};

/**
 * Get a boolean value from local storage
 *
 * @param name - key to load the value
 * @param defaultValue - default value to return if the key is not found
 * @returns loaded value or default value
 */
export const getBooleanValue = (name: string, defaultValue = true): boolean => {
  const stringValue = localStorage.getItem(name);
  if (stringValue === null || stringValue === undefined) {
    return defaultValue;
  }
  return stringValue === "true";
};
