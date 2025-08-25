const axios = require('axios');

let Service, Characteristic;

module.exports = (homebridge) => {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory(
    'homebridge-systemair-ventilator',
    'SystemairVentilator',
    SystemairVentilator
  );
};

class SystemairVentilator {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;

    this.axiosInstance = axios.create({
      timeout: 20000, // 20 seconds timeout
    });

    // Fan service
    this.fanService = new Service.Fanv2(this.config.name + " Fan");

    // Refresh service
    this.refreshService = new Service.Switch(this.config.name + " Refresh");

    // Timer service (using BatteryService instead of LightSensor)
    this.timerService = new Service.BatteryService(this.config.name + " Timer");

    // Thermostat service
    this.thermostatService = new Service.Thermostat(this.config.name + " Thermostat");

    // Humidity sensor service
    this.humiditySensorService = new Service.HumiditySensor(this.config.name + " Humidity");

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
      .onSet(this.setTargetTemperature.bind(this));

    this.thermostatService
      .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .onGet(this.getCurrentHeatingCoolingState.bind(this));

    this.thermostatService
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .onGet(this.getTargetHeatingCoolingState.bind(this))
      .onSet(this.setTargetHeatingCoolingState.bind(this));

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
        this.log(`Retrying request (${i + 1}/${retries}) due to: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1s delay before retry
      }
    }
  }

  async setActive(value) {
    const url = `http://${this.config.ip}/mwrite?{"1130":${value ? '1' : '0'}}`;
    this.log(`SetActive: Sending request to ${url}`);
    await this.retryRequest(url);
    this.log(`SetActive: Successfully set to ${value ? 'ON' : 'OFF'}`);
  }

  async getActive() {
    const url = `http://${this.config.ip}/mread?{"1130":1}`;
    this.log(`GetActive: Sending request to ${url}`);
    const response = await this.retryRequest(url);
    const isActive = response.data["1130"] > 0;
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

    const url = `http://${this.config.ip}/mwrite?{"1130":${speed}}`;
    this.log(`SetRotationSpeed: Setting speed to ${speed} (value: ${value}%)`);
    await this.retryRequest(url);
    this.log(`SetRotationSpeed: Successfully set to speed ${speed}`);
  }

  async getRotationSpeed() {
    const url = `http://${this.config.ip}/mread?{"1130":1}`;
    this.log(`GetRotationSpeed: Sending request to ${url}`);
    const response = await this.retryRequest(url);
    const speed = response.data["1130"];
    let percentage = speed === 2 ? 16 : speed === 3 ? 50 : speed === 4 ? 83 : 0;
    this.log(`GetRotationSpeed: Current speed is ${speed} (value: ${percentage}%)`);
    return percentage;
  }

  async setRefresh(value) {
    if (value) {
      const writeUrl = `http://${this.config.ip}/mwrite?{"1130":2,"1161":4,"2000":180,"2504":0,"16100":0}`;
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
    const url = `http://${this.config.ip}/mread?{"1110":2}`;
    this.log(`Timer: Fetching timer value from ${url}`);
    try {
      const response = await this.retryRequest(url);
      let timerValue = response.data["1110"]; // Extract timer value

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
    const url = `http://${this.config.ip}/mread?{"1120":1}`;
    this.log(`getCurrentTemperature: Fetching from ${url}`);
    try {
      const response = await this.retryRequest(url);
      const temperature = response.data["1120"] || 20; // Default to 20°C if no data
      this.log(`getCurrentTemperature: Current temperature is ${temperature}°C`);
      return temperature;
    } catch (error) {
      this.log(`getCurrentTemperature: Error - ${error.message}`);
      return 20; // Default to 20°C if an error occurs
    }
  }

  async getTargetTemperature() {
    const url = `http://${this.config.ip}/mread?{"2000":1}`;
    this.log(`getTargetTemperature: Fetching from ${url}`);
    try {
      const response = await this.retryRequest(url);
      const temperature = response.data["2000"] || 20; // Default to 20°C if no data
      this.log(`getTargetTemperature: Target temperature is ${temperature}°C`);
      return temperature;
    } catch (error) {
      this.log(`getTargetTemperature: Error - ${error.message}`);
      return 20; // Default to 20°C if an error occurs
    }
  }

  async setTargetTemperature(value) {
    const url = `http://${this.config.ip}/mwrite?{"2000":${value}}`;
    this.log(`setTargetTemperature: Setting target temperature to ${value}°C`);
    try {
      await this.retryRequest(url);
      this.log(`setTargetTemperature: Successfully set to ${value}°C`);
    } catch (error) {
      this.log(`setTargetTemperature: Error - ${error.message}`);
    }
  }

  async getCurrentHeatingCoolingState() {
    // For simplicity, we'll determine state based on fan activity
    // 0 = OFF, 1 = HEAT, 2 = COOL, 3 = AUTO
    const url = `http://${this.config.ip}/mread?{"1130":1}`;
    this.log(`getCurrentHeatingCoolingState: Fetching from ${url}`);
    try {
      const response = await this.retryRequest(url);
      const fanSpeed = response.data["1130"] || 0;
      const state = fanSpeed > 0 ? 3 : 0; // AUTO if fan is running, OFF otherwise
      this.log(`getCurrentHeatingCoolingState: Current state is ${state} (fan speed: ${fanSpeed})`);
      return state;
    } catch (error) {
      this.log(`getCurrentHeatingCoolingState: Error - ${error.message}`);
      return 0; // Default to OFF
    }
  }

  async getTargetHeatingCoolingState() {
    // Return AUTO as the target state when active
    const url = `http://${this.config.ip}/mread?{"1130":1}`;
    this.log(`getTargetHeatingCoolingState: Fetching from ${url}`);
    try {
      const response = await this.retryRequest(url);
      const fanSpeed = response.data["1130"] || 0;
      const state = fanSpeed > 0 ? 3 : 0; // AUTO if fan is running, OFF otherwise
      this.log(`getTargetHeatingCoolingState: Target state is ${state}`);
      return state;
    } catch (error) {
      this.log(`getTargetHeatingCoolingState: Error - ${error.message}`);
      return 0; // Default to OFF
    }
  }

  async setTargetHeatingCoolingState(value) {
    // 0 = OFF, 1 = HEAT, 2 = COOL, 3 = AUTO
    this.log(`setTargetHeatingCoolingState: Setting target state to ${value}`);
    try {
      if (value === 0) {
        // Turn off the fan
        await this.setActive(0);
      } else {
        // Turn on the fan (any heating/cooling/auto mode)
        await this.setActive(1);
      }
      this.log(`setTargetHeatingCoolingState: Successfully set to ${value}`);
    } catch (error) {
      this.log(`setTargetHeatingCoolingState: Error - ${error.message}`);
    }
  }

  // Humidity sensor method
  async getCurrentRelativeHumidity() {
    const url = `http://${this.config.ip}/mread?{"1125":1}`;
    this.log(`getCurrentRelativeHumidity: Fetching from ${url}`);
    try {
      const response = await this.retryRequest(url);
      const humidity = response.data["1125"] || 50; // Default to 50% if no data
      this.log(`getCurrentRelativeHumidity: Current humidity is ${humidity}%`);
      return humidity;
    } catch (error) {
      this.log(`getCurrentRelativeHumidity: Error - ${error.message}`);
      return 50; // Default to 50% if an error occurs
    }
  }

  getServices() {
    return [this.fanService, this.refreshService, this.timerService, this.thermostatService, this.humiditySensorService];
  }
}
