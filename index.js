const axios = require('axios');

let Service, Characteristic;

module.exports = (homebridge) => {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory(
    '@lv426/homebridge-systemair-enhanced',
    'SystemairVentilatorEnhanced',
    SystemairVentilator
  );
};

class SystemairVentilator {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;

    // Parameter IDs for Systemair SAVEConnect API
    // These may need adjustment based on your specific device model
    this.PARAM_IDS = {
      FAN_SPEED: '1130', // Fan speed control (0=off, 2=low, 3=medium, 4=high)
      TIMER: '1110', // Timer remaining time
      CURRENT_TEMP: '12543', // Current temperature sensor reading
      TARGET_TEMP: '2000', // Target temperature setting
      HUMIDITY: '12135', // Current humidity sensor reading
    };

    this.axiosInstance = axios.create({
      timeout: 20000, // 20 seconds timeout
    });

    // Fan service
    this.fanService = new Service.Fanv2(this.config.name + ' Fan');

    // Refresh service
    this.refreshService = new Service.Switch(this.config.name + ' Refresh');

    // Timer service (using BatteryService instead of LightSensor)
    this.timerService = new Service.BatteryService(this.config.name + ' Timer');

    // Thermostat service
    this.thermostatService = new Service.Thermostat(
      this.config.name + ' Thermostat'
    );

    // Humidity sensor service
    this.humiditySensorService = new Service.HumiditySensor(
      this.config.name + ' Humidity'
    );

    this.setupCharacteristics();
  }

  setupCharacteristics() {
    // Fan characteristics
    this.fanService
      .getCharacteristic(Characteristic.Active)
      .onSet(this.setActive.bind(this))
      .onGet(this.getActive.bind(this));

    this.fanService
      .getCharacteristic(Characteristic.RotationSpeed)
      .onSet(this.setRotationSpeed.bind(this))
      .onGet(this.getRotationSpeed.bind(this));

    // Refresh characteristic
    this.refreshService
      .getCharacteristic(Characteristic.On)
      .onSet(this.setRefresh.bind(this));

    // Timer characteristic (using Battery Level to store remaining time)
    this.timerService
      .getCharacteristic(Characteristic.BatteryLevel)
      .onGet(this.getTimer.bind(this));

    // Thermostat characteristics
    this.thermostatService
      .getCharacteristic(Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemperature.bind(this));

    this.thermostatService
      .getCharacteristic(Characteristic.TargetTemperature)
      .onGet(this.getTargetTemperature.bind(this))
      .onSet(this.setTargetTemperature.bind(this))
      .setProps({
        minValue: 10,
        maxValue: 38,
        minStep: 1,
      });

    this.thermostatService
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .onGet(this.getTargetHeatingCoolingState.bind(this))
      .onSet(this.setTargetHeatingCoolingState.bind(this))
      .setProps({
        validValues: [0, 3], // Only OFF and AUTO modes supported
      });

    this.thermostatService
      .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .onGet(this.getCurrentHeatingCoolingState.bind(this));

    // Humidity sensor characteristic
    this.humiditySensorService
      .getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .onGet(this.getCurrentRelativeHumidity.bind(this));
  }

  async retryRequest(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await this.axiosInstance.get(url);
      } catch (error) {
        if (i === retries - 1) {
          this.log(`Retry failed: ${error.message}`);
          throw error;
        }
        this.log(
          `Retrying request (${i + 1}/${retries}) due to: ${error.message}`
        );
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1s delay before retry
      }
    }
  }

  async setActive(value) {
    const url = `http://${this.config.ip}/mwrite?{"${
      this.PARAM_IDS.FAN_SPEED
    }":${value ? '1' : '0'}}`;
    this.log(`SetActive: Sending request to ${url}`);
    await this.retryRequest(url);
    this.log(`SetActive: Successfully set to ${value ? 'ON' : 'OFF'}`);
  }

  async getActive() {
    const url = `http://${this.config.ip}/mread?{"${this.PARAM_IDS.FAN_SPEED}":1}`;
    this.log(`GetActive: Sending request to ${url}`);
    const response = await this.retryRequest(url);
    const isActive = response.data[this.PARAM_IDS.FAN_SPEED] > 0;
    this.log(`GetActive: Current state is ${isActive ? 'ON' : 'OFF'}`);
    return isActive ? 1 : 0;
  }

  async setRotationSpeed(value) {
    let speed;
    if (value === 0) {
      speed = 0;
    } else if (value <= 16) {
      speed = 2;
    } else if (value <= 50) {
      speed = 3;
    } else {
      speed = 4;
    }

    const url = `http://${this.config.ip}/mwrite?{"${this.PARAM_IDS.FAN_SPEED}":${speed}}`;
    this.log(`SetRotationSpeed: Setting speed to ${speed} (value: ${value}%)`);
    await this.retryRequest(url);
    this.log(`SetRotationSpeed: Successfully set to speed ${speed}`);
  }

  async getRotationSpeed() {
    const url = `http://${this.config.ip}/mread?{"${this.PARAM_IDS.FAN_SPEED}":1}`;
    this.log(`GetRotationSpeed: Sending request to ${url}`);
    const response = await this.retryRequest(url);
    const speed = response.data[this.PARAM_IDS.FAN_SPEED];
    let percentage = speed === 2 ? 16 : speed === 3 ? 50 : speed === 4 ? 83 : 0;
    this.log(
      `GetRotationSpeed: Current speed is ${speed} (value: ${percentage}%)`
    );
    return percentage;
  }

  async setRefresh(value) {
    if (value) {
      const writeUrl = `http://${this.config.ip}/mwrite?{"${this.PARAM_IDS.FAN_SPEED}":2,"1161":4,"${this.PARAM_IDS.TARGET_TEMP}":180,"2504":0,"16100":0}`;
      this.log(`Refresh: Sending request to ${writeUrl}`);
      await this.retryRequest(writeUrl);
      this.log(`Refresh: Successfully started refresh mode.`);
      setTimeout(() => {
        this.refreshService
          .getCharacteristic(Characteristic.On)
          .updateValue(false);
      }, 1000);
    }
  }

  async getTimer() {
    const url = `http://${this.config.ip}/mread?{"${this.PARAM_IDS.TIMER}":2}`;
    this.log(`Timer: Fetching timer value from ${url}`);
    try {
      const response = await this.retryRequest(url);
      let timerValue = response.data[this.PARAM_IDS.TIMER]; // Extract timer value

      // Ensure timer value is valid for HomeKit (0 - 100% battery level range)
      if (timerValue < 0) {
        timerValue = 0;
      } else if (timerValue > 100) {
        timerValue = 100; // Max HomeKit battery level
      }

      this.log(`Timer: Current remaining time is ${timerValue} minutes.`);
      return timerValue; // Return valid percentage
    } catch (error) {
      this.log(`Timer: Error - ${error.message}`);
      return 0; // Default to 0% if an error occurs
    }
  }

  // Thermostat methods
  async getCurrentTemperature() {
    const url = `http://${this.config.ip}/mread?{"${this.PARAM_IDS.CURRENT_TEMP}":1}`;
    this.log(`getCurrentTemperature: Fetching from ${url}`);
    try {
      const response = await this.retryRequest(url);
      let temperature = response.data[this.PARAM_IDS.CURRENT_TEMP] / 10 || 20; // Default to 20°C if no data

      // Ensure temperature is within HomeKit range (10 to 38°C)
      temperature = Math.max(10, Math.min(38, temperature));

      this.log(
        `getCurrentTemperature: Current temperature is ${temperature}°C`
      );
      return temperature;
    } catch (error) {
      this.log(`getCurrentTemperature: Error - ${error.message}`);
      return 20; // Default to 20°C if an error occurs
    }
  }

  async getTargetTemperature() {
    const url = `http://${this.config.ip}/mread?{"${this.PARAM_IDS.TARGET_TEMP}":1}`;
    this.log(`getTargetTemperature: Fetching from ${url}`);
    try {
      const response = await this.retryRequest(url);
      let temperature = response.data[this.PARAM_IDS.TARGET_TEMP] / 10 || 20; // Default to 20°C if no data

      // Ensure temperature is within HomeKit target range (10-38°C)
      temperature = Math.max(10, Math.min(38, temperature));

      this.log(`getTargetTemperature: Target temperature is ${temperature}°C`);
      return temperature;
    } catch (error) {
      this.log(`getTargetTemperature: Error - ${error.message}`);
      return 20; // Default to 20°C if an error occurs
    }
  }

  async setTargetTemperature(value) {
    // Ensure the value is within valid range
    value = Math.max(10, Math.min(38, value));

    const url = `http://${this.config.ip}/mwrite?{"${
      this.PARAM_IDS.TARGET_TEMP
    }":${value * 10}}`;
    this.log(`setTargetTemperature: Setting target temperature to ${value}°C`);
    try {
      await this.retryRequest(url);
      this.log(`setTargetTemperature: Successfully set to ${value}°C`);
    } catch (error) {
      this.log(`setTargetTemperature: Error - ${error.message}`);
    }
  }

  async getCurrentHeatingCoolingState() {
    // Always return Auto
    const targetTemperature = await this.getTargetTemperature();
    const currentTemperature = await this.getCurrentTemperature();

    if (!targetTemperature) {
      return 0; // Off
    }

    if (currentTemperature < targetTemperature) {
      return 1; // Heating
    } else {
      return 2; // Cooling
    }
  }

  async getTargetHeatingCoolingState() {
    return this.getCurrentHeatingCoolingState();
  }

  async setTargetHeatingCoolingState(value) {
    if (value === 0) {
      await this.setActive(0); // Turn off the fan
    } else {
      await this.setActive(1); // Turn on the fan
    }
  }

  // Humidity sensor method
  async getCurrentRelativeHumidity() {
    const url = `http://${this.config.ip}/mread?{"${this.PARAM_IDS.HUMIDITY}":1}`;
    this.log(`getCurrentRelativeHumidity: Fetching from ${url}`);
    try {
      const response = await this.retryRequest(url);
      let humidity = response.data[this.PARAM_IDS.HUMIDITY] || 50; // Default to 50% if no data

      // Ensure humidity is within valid range (0-100%)
      humidity = Math.max(0, Math.min(100, humidity));

      this.log(`getCurrentRelativeHumidity: Current humidity is ${humidity}%`);
      return humidity;
    } catch (error) {
      this.log(`getCurrentRelativeHumidity: Error - ${error.message}`);
      return 50; // Default to 50% if an error occurs
    }
  }

  getServices() {
    return [
      this.fanService,
      this.refreshService,
      this.timerService,
      this.thermostatService,
      this.humiditySensorService,
    ];
  }
}
