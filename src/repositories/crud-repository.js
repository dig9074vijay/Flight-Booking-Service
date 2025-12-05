const { Logger } = require("../config");
const { StatusCodes } = require("http-status-codes");
const AppError = require("../utils/errors/app-error");
class CrudRepository {
  constructor(model) {
    this.model = model;
  }

  async create(data) {
    const result = await this.model.create(data);
    return result;
  }

  async destroy(data) {
    const result = await this.model.destroy({
      where: {
        id: data,
      },
    });
    if (!result) {
      throw new AppError(
        "Not able to find the resource",
        StatusCodes.NOT_FOUND
      );
    }
    return result;
  }

  async get(data) {
    const result = await this.model.findByPk(data);
    if (!result) {
      throw new AppError(
        "Not able to find the resource",
        StatusCodes.NOT_FOUND
      );
    }
    return result;
  }

  async getAll() {
    const result = await this.model.findAll();
    return result;
  }

  async update(data, id) {
    Logger.info(`Update result for id ${id}`);
    const result = await this.model.update(data, {
      where: { id: id },
  });
    Logger.info(`Update result for id ${id}: ${result}`);
    if (!result) {
      throw new AppError(
        "Not able to find the resource",
        StatusCodes.NOT_FOUND
      );
    }
    return result;
  }
}

module.exports = CrudRepository;
